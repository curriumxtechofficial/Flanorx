import asyncHandler from "express-async-handler";
import { OAuth2Client } from "google-auth-library";
import User from "../models/userModel.js";
import generateToken from "../utils/generateToken.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const getUserInfoFromAccessToken = async (accessToken) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info from Google");
  }

  return response.json();
};

 const googleAuth = asyncHandler(async (req, res) => {
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
    // 2) Otherwise treat as access token (your popup flow uses access_token)
    const userInfo = await getUserInfoFromAccessToken(googleToken);
    googleId = userInfo.sub || `google-${userInfo.email}`;
    email = userInfo.email;
    name = userInfo.name;
    picture = userInfo.picture;
  }

  // Find user by googleId or email
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    const baseUsername = (email?.split("@")[0] || name || "user")
      .toLowerCase()
      .replace(/\s+/g, "");

    let username = baseUsername;
    let counter = 1;

    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter++}`;
    }

    user = await User.create({
      googleId,
      name: name || "",
      username,
      email,
      profile: picture || "",
      password: `google-auth-${googleId}`,
      isVerified: true,
      authMethod: "google",
    });
  } else if (!user.googleId) {
    user.googleId = googleId;
    user.isVerified = true;
    await user.save();
  }

  const token = generateToken(res, user._id);

  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    authMethod: user.authMethod,
    token,
  });
});


const logoutUser = asyncHandler(async (req, res) => {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0), // immediately expire
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  res.status(200).json({ message: "Logged out successfully" });
});

export {
  googleAuth,
  logoutUser
}