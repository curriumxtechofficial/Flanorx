// routes/deliveryRoutes.js
import express from "express";
import {
  getAvailableDeliveries,
  getMyAssignedDeliveries,
  acceptDelivery,
  updateDeliveryProgress,
  confirmDeliveryByCustomer,
  getDeliveryDetails,
  getRiderEarnings,
} from "../controllers/deliveryController.js";

import {
  protect,
  authenticateAdmin,
  authenticateRider,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// rider
router.get("/available", authenticateRider, getAvailableDeliveries);
router.get("/my-deliveries", authenticateRider, getMyAssignedDeliveries);
router.get("/rider/earnings", authenticateRider, getRiderEarnings);
router.put("/:id/accept", authenticateRider, acceptDelivery);
router.put("/:id/status", authenticateRider, updateDeliveryProgress);

// customer
router.put("/:id/confirm", protect, confirmDeliveryByCustomer);

// mixed access
router.get("/:id", (req, res, next) => {
  authenticateRider(req, res, (err) => {
    if (!err) return getDeliveryDetails(req, res, next);

    protect(req, res, (err2) => {
      if (!err2) return getDeliveryDetails(req, res, next);

      authenticateAdmin(req, res, (err3) => {
        if (!err3) return getDeliveryDetails(req, res, next);

        res.status(401);
        return next(new Error("Not authorized"));
      });
    });
  });
});

export default router;