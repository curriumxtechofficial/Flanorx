// routes/orderRoutes.js
import express from "express";
const router = express.Router();

import {
  createOrder,
  getOrder,
  getOrders,
  getMyOrders,
  getMyTotalSpent,
  getMyActiveOrder,
  payOrder,
  getDeliveryStatus,
  updateOrderStatus,
  getDashboardStats,
  verifyPaymentAndGetOrder,
  initializePaymentForOrder,
} from "../controllers/orderController.js";

import {
  protect,
  authenticateAdmin,
  authenticateRider,
} from "../middleware/authMiddleware.js";

// ─────────────────────────────────────────────────────────────
// Order Routes
// ─────────────────────────────────────────────────────────────

// Public/Protected routes (USER)
router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.get("/total-spent", protect, getMyTotalSpent);
router.get("/active", protect, getMyActiveOrder);

// Payment route
router.put("/:id/pay", protect, payOrder);

router.post("/:id/initialize-payment", protect, initializePaymentForOrder);

// Delivery status route (USER, RIDER, ADMIN)
router.get("/:id/delivery-status", (req, res, next) => {
  protect(req, res, (err) => {
    if (!err) return getDeliveryStatus(req, res, next);

    authenticateRider(req, res, (err2) => {
      if (!err2) return getDeliveryStatus(req, res, next);

      authenticateAdmin(req, res, (err3) => {
        if (!err3) return getDeliveryStatus(req, res, next);

        res.status(401);
        return next(new Error("Not authorized"));
      });
    });
  });
});

// Get single order (USER, RIDER, ADMIN)
router.get("/:id", (req, res, next) => {
  protect(req, res, (err) => {
    if (!err) return getOrder(req, res, next);

    authenticateRider(req, res, (err2) => {
      if (!err2) return getOrder(req, res, next);

      authenticateAdmin(req, res, (err3) => {
        if (!err3) return getOrder(req, res, next);

        res.status(401);
        return next(new Error("Not authorized"));
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Admin only routes
// ─────────────────────────────────────────────────────────────
router.get("/", authenticateAdmin, getOrders);
router.get("/stats/dashboard", authenticateAdmin, getDashboardStats);
router.put("/:id/status", authenticateAdmin, updateOrderStatus);
router.get("/verify/:reference", protect, verifyPaymentAndGetOrder);

// ─────────────────────────────────────────────────────────────
// Rider routes
// ─────────────────────────────────────────────────────────────
// Riders can update delivery status of assigned orders
router.put("/:id/delivery-status", authenticateRider, updateOrderStatus);

// Riders can get their assigned orders
router.get("/rider/assigned", authenticateRider, async (req, res) => {
  try {
    const Order = await import("../models/orderModel.js").then(m => m.default);
    const orders = await Order.find({ 
      rider: req.user._id,
      deliveryStatus: { $in: ["assigned", "picked_up", "in_transit"] }
    }).populate("user", "name email phone deliveryAddress");
    
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Riders can mark order as delivered
router.put("/:id/delivered", authenticateRider, async (req, res) => {
  try {
    const Order = await import("../models/orderModel.js").then(m => m.default);
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      res.status(404);
      throw new Error("Order not found");
    }
    
    // Check if rider is assigned to this order
    if (order.rider?.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Not assigned to this order");
    }
    
    order.deliveryStatus = "delivered";
    order.status = "completed";
    await order.save();
    
    res.status(200).json({ message: "Order marked as delivered", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;