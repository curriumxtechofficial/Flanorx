import express from "express";
import Rider from "../models/riderModel.js";
import asyncHandler from "express-async-handler";
import generateToken from "../utils/generateToken.js";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// utils/googleUserInfo.js
const getRiderInfoFromAccessToken = async (accessToken) => {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch rider info from Google");
  }

  return response.json();
};

const riderGoogleAuth = asyncHandler(async (req, res) => {
  const { token: googleToken } = req.body;

  if (!googleToken) {
    res.status(400);
    throw new Error("Google token is required");
  }

  let googleId, email, name, picture;

  // 1) Try as ID token
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    googleId = payload.sub;
    email = payload.email;
    name = payload.name;
    picture = payload.picture;
  } catch (err) {
    // 2) Otherwise treat as access token
    const riderInfo = await getRiderInfoFromAccessToken(googleToken);
    googleId = riderInfo.sub || `google-${riderInfo.email}`;
    email = riderInfo.email;
    name = riderInfo.name;
    picture = riderInfo.picture;
  }

  if (!email) {
    res.status(400);
    throw new Error("Google account email not found");
  }

  // Find rider by googleId or email
  let rider = await Rider.findOne({ $or: [{ googleId }, { email }] });

  // If rider does not exist, create a minimal rider record
  // (they'll complete required verification details on the next page)
  if (!rider) {
    rider = await Rider.create({
      googleId,
      name: name || "",
      email,
      profilePicture: picture || "",
      password: `google-auth-${googleId}`, // just a placeholder for schema
      authMethod: "google",
      verificationStatus: "none", // none | pending | approved | rejected
      walletBalance: 0,
    });
  } else {
    // Ensure googleId is saved if they existed from normal signup
    let changed = false;

    if (!rider.googleId) {
      rider.googleId = googleId;
      rider.authMethod = "google";
      changed = true;
    }

    // Optional: refresh their picture/name if you want
    if (picture && rider.profilePicture !== picture) {
      rider.profilePicture = picture;
      changed = true;
    }
    if (name && rider.name !== name) {
      rider.name = name;
      changed = true;
    }

    if (changed) await rider.save();
  }

  const token = generateToken(res, rider._id);

  // Frontend can decide:
  // - if required fields missing => redirect to verification form page
  // - if verificationStatus !== 'approved' => block rider-dashboard.html
  res.status(200).json({
    _id: rider._id,
    name: rider.name,
    email: rider.email,
    profilePicture: rider.profilePicture,
    verificationStatus: rider.verificationStatus, // ✅ use this instead of isVerified
    authMethod: rider.authMethod,
    token,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Register a new rider with email & password
// @route   POST /api/riders/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────

const pickFileUrl = (files, fieldName) => {
  const file = files?.[fieldName]?.[0];
  // multer-storage-cloudinary usually provides .path as the secure URL
  return file?.path || file?.secure_url || null;
};

const submitRiderVerification = asyncHandler(async (req, res) => {
  const riderId = req.rider?._id;

  if (!riderId) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const {
    nin,
    fuelingStation,
    bankAccountNumber,
    bankName,
    accountName,
  } = req.body;

  // ✅ Files uploaded to Cloudinary (coming from multer)
  const profilePictureUrl = pickFileUrl(req.files, "profilePicture");
  const ninPictureUrl = pickFileUrl(req.files, "ninPicture");
  const proofOfAddressUrl = pickFileUrl(req.files, "proofOfAddress");

  // Required verification fields
  if (!nin || !fuelingStation) {
    res.status(400);
    throw new Error("nin and fuelingStation are required");
  }

  // If you want proofOfAddress as REQUIRED upload:
  if (!proofOfAddressUrl) {
    res.status(400);
    throw new Error("proofOfAddress image is required");
  }

  // Basic NIN sanity check (Nigeria NIN is typically 11 digits)
  const cleanedNin = String(nin).replace(/\s+/g, "");
  if (!/^\d{11}$/.test(cleanedNin)) {
    res.status(400);
    throw new Error("NIN must be 11 digits");
  }

  const rider = await Rider.findById(riderId);

  if (!rider) {
    res.status(404);
    throw new Error("Rider not found");
  }

  // Ensure NIN is unique across riders
  const ninOwner = await Rider.findOne({
    nin: cleanedNin,
    _id: { $ne: riderId },
  });

  if (ninOwner) {
    res.status(409);
    throw new Error("This NIN is already in use");
  }

  // Save verification details
  rider.nin = cleanedNin;
  rider.fuelingStation = fuelingStation;

  // ✅ save urls from Cloudinary
  rider.proofOfAddress = proofOfAddressUrl;

  if (profilePictureUrl) rider.profilePicture = profilePictureUrl;
  if (ninPictureUrl) rider.ninPicture = ninPictureUrl;

  if (bankAccountNumber) rider.bankAccountNumber = bankAccountNumber;
  if (bankName) rider.bankName = bankName;
  if (accountName) rider.accountName = accountName;

  // Always pending until admin verifies
  rider.verificationStatus = "pending";

  await rider.save();

  res.status(200).json({
    message: "Verification details submitted successfully. Awaiting admin approval.",
    rider: {
      _id: rider._id,
      name: rider.name,
      email: rider.email,
      nin: rider.nin,
      proofOfAddress: rider.proofOfAddress,
      fuelingStation: rider.fuelingStation,
      profilePicture: rider.profilePicture,
      ninPicture: rider.ninPicture,
      bankAccountNumber: rider.bankAccountNumber,
      bankName: rider.bankName,
      accountName: rider.accountName,
      verificationStatus: rider.verificationStatus,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout rider — clear cookie
// @route   POST /api/riders/logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const logoutRider = asyncHandler(async (req, res) => {
  // Also flip the rider offline on logout
  await Rider.findByIdAndUpdate(req.rider._id, { status: "offline" });

  res.cookie("jwt", "", { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get logged-in rider's profile
// @route   GET /api/riders/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const getRiderProfile = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.rider._id).select("-password");

  if (!rider) {
    res.status(404);
    throw new Error("Rider not found");
  }

  res.status(200).json({
    _id: rider._id,
    name: rider.name,
    email: rider.email,

    // existing
    profile: rider.profile,
    status: rider.status,
    last_lat: rider.last_lat,
    last_lng: rider.last_lng,
    authMethod: rider.authMethod,

    // ✅ ADD THESE (so frontend can decide: form/pending/dashboard)
    isVerified: rider.isVerified,

    nin: rider.nin,
    fuelingStation: rider.fuelingStation,
    proofOfAddress: rider.proofOfAddress,

    // optional but recommended (for rejected message)
    ninPicture: rider.ninPicture,
    bankAccountNumber: rider.bankAccountNumber,
    bankName: rider.bankName,
    accountName: rider.accountName,

    // if your schema has them:
    verificationStatus: rider.verificationStatus,
    rejectionReason: rider.rejectionReason,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update logged-in rider's profile
// @route   PATCH /api/riders/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const updateRiderProfile = asyncHandler(async (req, res) => {
  const rider = await Rider.findById(req.rider._id);

  if (!rider) {
    res.status(404);
    throw new Error("Rider not found");
  }

  rider.name = req.body.name ?? rider.name;
  rider.email = req.body.email ?? rider.email;
  rider.profile = req.body.profile ?? rider.profile;

  // Only re-hash if a new password is supplied — pre('save') handles the hashing
  if (req.body.password) {
    rider.password = req.body.password;
  }

  const updated = await rider.save();
  const token = generateToken(res, updated._id);

  res.status(200).json({
    _id: updated._id,
    name: updated.name,
    email: updated.email,
    profile: updated.profile,
    status: updated.status,
    token,
    cookieSet: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Toggle rider online / offline  (Status button in dashboard)
// @route   PATCH /api/riders/status
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const updateRiderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["online", "offline"].includes(status)) {
    res.status(400);
    throw new Error("Status must be 'online' or 'offline'");
  }

  const rider = await Rider.findByIdAndUpdate(
    req.rider._id,
    { status },
    { new: true },
  ).select("-password");

  res.status(200).json({
    _id: rider._id,
    status: rider.status,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update rider GPS coordinates  (Area Demand Map heartbeat)
// @route   PATCH /api/riders/location
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const updateRiderLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined) {
    res.status(400);
    throw new Error("lat and lng are required");
  }

  await Rider.findByIdAndUpdate(req.rider._id, {
    last_lat: lat,
    last_lng: lng,
  });

  res.status(200).json({ success: true, message: "Location updated" });
});

export {
  riderGoogleAuth,
  submitRiderVerification,
  logoutRider,
  getRiderProfile,
  updateRiderProfile,
  updateRiderStatus,
  updateRiderLocation,
};
