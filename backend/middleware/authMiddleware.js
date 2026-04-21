import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";

import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import Rider from "../models/riderModel.js";

const getTokenFromRequest = (req) => {
  if (req.cookies?.jwt) {
    return req.cookies.jwt;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return null;
};

// USER AUTH
const protect = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      res.status(401);
      throw new Error("User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, invalid token");
  }
});

// RIDER AUTH
const authenticateRider = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const rider = await Rider.findById(decoded.userId).select("-password");

    if (!rider) {
      res.status(401);
      throw new Error("Rider not found");
    }

    req.rider = rider;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, invalid token");
  }
});

// ADMIN AUTH
const authenticateAdmin = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.userId).select("-password");

    if (!admin) {
      res.status(401);
      throw new Error("Admin not found");
    }

    req.admin = admin;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, invalid token");
  }
});

// SUPER ADMIN ONLY
const requireSuperAdmin = asyncHandler(async (req, res, next) => {
  if (!req.admin) {
    res.status(401);
    throw new Error("Not authorized as admin");
  }

  const isSuper =
    req.admin.isSuperAdmin === true ||
    req.admin.role === "superadmin" ||
    req.admin.role === "SuperAdmin";

  if (!isSuper) {
    res.status(403);
    throw new Error("Super admin access required");
  }

  next();
});

export { protect, authenticateRider, authenticateAdmin, requireSuperAdmin };