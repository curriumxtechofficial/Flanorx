// routes/trackingRoutes.js
import express from "express";
const router = express.Router();

import {
  startTracking,
  updateUserLocation,
  updateRiderLocation,
  getTracking,
  stopTracking,
} from "../controllers/trackingController.js";

import {
  protect,
  authenticateRider,
  authenticateAdmin,
} from "../middleware/authMiddleware.js";

// ─────────────────────────────────────────────────────────────
// Tracking Routes
// NOTE:
// - startTracking: rider starts tracking AFTER confirming/accepting order
// - user-location: user sends live location updates
// - rider-location: rider sends live location updates
// - getTracking: both user and rider can view (controller enforces ownership)
// - stopTracking: rider or admin can stop
// ─────────────────────────────────────────────────────────────

// Rider starts tracking for an order (after confirm)
router.post("/start/:orderId", authenticateRider, startTracking);

// User updates their location (so rider can see)
router.patch("/user-location/:orderId", protect, updateUserLocation);

// Rider updates their location (so user can see)
router.patch("/rider-location/:orderId", authenticateRider, updateRiderLocation);

// Get tracking details (User OR Rider can view — controller checks)
router.get("/:orderId", (req, res, next) => {
  // try user auth first; if no cookie/invalid, try rider auth
  // this allows one endpoint for both user and rider
  protect(req, res, (err) => {
    if (!err) return getTracking(req, res, next);

    authenticateRider(req, res, (err2) => {
      if (!err2) return getTracking(req, res, next);

      // optional: allow admin to view too
      authenticateAdmin(req, res, (err3) => {
        if (!err3) return getTracking(req, res, next);

        res.status(401);
        return next(new Error("Not authorized"));
      });
    });
  });
});

// Stop tracking (Rider OR Admin)
router.patch("/stop/:orderId", (req, res, next) => {
  authenticateRider(req, res, (err) => {
    if (!err) return stopTracking(req, res, next);

    authenticateAdmin(req, res, (err2) => {
      if (!err2) return stopTracking(req, res, next);

      res.status(401);
      return next(new Error("Not authorized"));
    });
  });
});

export default router;