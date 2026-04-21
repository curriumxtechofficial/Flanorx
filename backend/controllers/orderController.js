// controllers/orderController.js
import asyncHandler from "express-async-handler";
import axios from "axios";
import Order from "../models/orderModel.js";

const PAYSTACK_BASE = "https://api.paystack.co";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const parseMonthYear = (month, year) => {
  const m = Number(month);
  const y = Number(year);

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error("Invalid month. Use 1 - 12");
  }

  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error("Invalid year");
  }

  return { m, y };
};

const getAuthActor = (req) => {
  return {
    userId: req.user?._id || null,
    riderId: req.rider?._id || null,
    isAdmin: req.user?.role === "admin",
  };
};

const canAccessOrder = (req, order) => {
  const { userId, riderId, isAdmin } = getAuthActor(req);

  if (isAdmin) return true;
  if (userId && order.user?.toString() === userId.toString()) return true;
  if (riderId && order.rider?.toString() === riderId.toString()) return true;

  return false;
};

const getPaystackHeaders = () => ({
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
});

const initializePaystackPayment = async ({ email, amountInKobo, reference, orderId }) => {
  const initResp = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    {
      email,
      amount: amountInKobo,
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      metadata: {
        orderId: orderId.toString(),
        app: "flanorx",
      },
    },
    {
      headers: getPaystackHeaders(),
    }
  );

  return initResp?.data?.data || {};
};

const verifyPaystackPayment = async (reference) => {
  const verifyResp = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );

  return verifyResp?.data?.data || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create Order (Customer)
// @route   POST /api/order
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const createOrder = asyncHandler(async (req, res) => {
  const {
    fuelType,
    fillingStation,
    quantity,
    deliveryAddress,
    deliveryCoordinates,
    scheduleType,
    scheduledDate,
    scheduledTime,
    subtotal,
    deliveryFee,
    serviceTax,
    totalAmount,
    notes,
    estimatedDeliveryMinutes,
  } = req.body;

  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  if (!fuelType || !fillingStation || !quantity || !deliveryAddress || !scheduleType) {
    res.status(400);
    throw new Error("Missing required order fields");
  }

  if (scheduleType === "scheduled" && (!scheduledDate || !scheduledTime)) {
    res.status(400);
    throw new Error("Scheduled date and time are required for scheduled deliveries");
  }

  const parsedQuantity = Number(quantity);
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    res.status(400);
    throw new Error("Quantity must be a valid number");
  }

  const priceCalculation = Order.calculatePrice(fuelType, parsedQuantity);

  const finalSubtotal =
    subtotal !== undefined ? Number(subtotal) : Number(priceCalculation.subtotal);
  const finalDeliveryFee =
    deliveryFee !== undefined ? Number(deliveryFee) : Number(priceCalculation.deliveryFee);
  const finalServiceTax =
    serviceTax !== undefined ? Number(serviceTax) : Number(priceCalculation.serviceTax);
  const finalTotal =
    totalAmount !== undefined ? Number(totalAmount) : Number(priceCalculation.total);

  const orderData = {
    user: req.user._id,
    fuelType,
    fuelPricePerLiter: priceCalculation.pricePerLiter,
    fillingStation,
    quantity: parsedQuantity,
    deliveryAddress,
    scheduleType,
    subtotal: finalSubtotal,
    deliveryFee: finalDeliveryFee,
    serviceTax: finalServiceTax,
    totalAmount: finalTotal,
    paid: false,
    status: "pending",
    deliveryStatus: "pending",
    estimatedDeliveryMinutes:
      estimatedDeliveryMinutes || (scheduleType === "now" ? 30 : null),
  };

  if (
    deliveryCoordinates &&
    typeof deliveryCoordinates === "object" &&
    deliveryCoordinates.lat !== undefined &&
    deliveryCoordinates.lng !== undefined
  ) {
    orderData.deliveryCoordinates = {
      lat: Number(deliveryCoordinates.lat),
      lng: Number(deliveryCoordinates.lng),
    };
  }

  if (scheduleType === "scheduled") {
    orderData.scheduledDate = scheduledDate;
    orderData.scheduledTime = scheduledTime;
  }

  if (notes) {
    orderData.notes = notes;
  }

  const created = await Order.create(orderData);

  const amountInKobo = Math.round(Number(created.totalAmount) * 100);
  const reference = `FLX_${created._id}_${Date.now()}`;

  const paystackData = await initializePaystackPayment({
    email: req.user.email,
    amountInKobo,
    reference,
    orderId: created._id,
  });

  const authUrl = paystackData?.authorization_url;
  const paystackRef = paystackData?.reference;

  if (!authUrl || !paystackRef) {
    await Order.findByIdAndDelete(created._id);
    res.status(502);
    throw new Error("Failed to initialize Paystack payment");
  }

  created.paymentReference = paystackRef;
  created.paymentMethod = "card";
  await created.save();

  res.status(201).json({
    order: created,
    authorization_url: authUrl,
    reference: paystackRef,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Process payment and mark order as paid
// @route   PUT /api/order/:id/pay
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const payOrder = asyncHandler(async (req, res) => {
  const { paymentReference } = req.body;

  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not allowed to pay for this order");
  }

  if (order.paid) {
    res.status(400);
    throw new Error("Order has already been paid");
  }

  const refToVerify = paymentReference || order.paymentReference;
  if (!refToVerify) {
    res.status(400);
    throw new Error("Missing payment reference");
  }

  const data = await verifyPaystackPayment(refToVerify);

  if (!data) {
    res.status(502);
    throw new Error("Unable to verify payment");
  }

  const expectedKobo = Math.round(Number(order.totalAmount) * 100);

  if (data.status !== "success") {
    res.status(400);
    throw new Error(`Payment not successful (${data.status})`);
  }

  if (Number(data.amount) !== expectedKobo) {
    res.status(400);
    throw new Error("Payment amount mismatch");
  }

  const updatedOrder = await order.markAsPaid(refToVerify, "card");

  res.status(200).json({
    success: true,
    message: "Payment verified and order marked as paid",
    order: updatedOrder,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get single Order
// @route   GET /api/order/:id
// @access  Private (customer / assigned rider / admin)
// ─────────────────────────────────────────────────────────────────────────────
const getOrder = asyncHandler(async (req, res) => {
  const { userId, riderId, isAdmin } = getAuthActor(req);

  if (!userId && !riderId && !isAdmin) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const order = await Order.findById(req.params.id)
    .populate("user", "name email")
    .populate("rider", "name email profilePicture");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (!canAccessOrder(req, order)) {
    res.status(403);
    throw new Error("Not allowed");
  }

  res.status(200).json(order);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get logged-in user's orders
// @route   GET /api/order/my?month=2&year=2026&status=pending
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrders = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const { month, year, status, paid, deliveryStatus } = req.query;

  const filter = { user: req.user._id };

  if (status) filter.status = status;
  if (deliveryStatus) filter.deliveryStatus = deliveryStatus;
  if (paid !== undefined) filter.paid = paid === "true";

  if (month && year) {
    const { m, y } = parseMonthYear(month, year);
    filter.orderMonth = m;
    filter.orderYear = y;
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("rider", "name profilePicture");

  res.status(200).json(orders);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get total spent for a month/year
// @route   GET /api/order/total-spent?month=2&year=2026&paid=true
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const getMyTotalSpent = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const { month, year, paid } = req.query;

  if (!month || !year) {
    res.status(400);
    throw new Error("month and year are required");
  }

  const { m, y } = parseMonthYear(month, year);

  const matchStage = {
    user: req.user._id,
    orderMonth: m,
    orderYear: y,
    paid: paid !== undefined ? paid === "true" : true,
  };

  const result = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: "$totalAmount" },
        count: { $sum: 1 },
        totalLiters: { $sum: "$quantity" },
      },
    },
  ]);

  res.status(200).json({
    month: m,
    year: y,
    paid: matchStage.paid,
    totalSpent: result[0]?.totalSpent || 0,
    ordersCount: result[0]?.count || 0,
    totalLiters: result[0]?.totalLiters || 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get logged-in user's active order
// @route   GET /api/order/active
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const getMyActiveOrder = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const activeOrder = await Order.findOne({
    user: req.user._id,
    paid: true,
    status: { $in: ["processing"] },
    deliveryStatus: {
      $in: ["pending", "accepted", "picked_up", "in_transit", "delivered"],
    },
  })
    .sort({ createdAt: -1 })
    .populate("rider", "name profilePicture");

  res.status(200).json(activeOrder || null);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get delivery status for an order
// @route   GET /api/order/:id/delivery-status
// @access  Private (customer / assigned rider / admin)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryStatus = asyncHandler(async (req, res) => {
  const { userId, riderId, isAdmin } = getAuthActor(req);

  if (!userId && !riderId && !isAdmin) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const order = await Order.findById(req.params.id)
    .select(
      [
        "user",
        "rider",
        "status",
        "deliveryStatus",
        "estimatedDeliveryMinutes",
        "scheduledDate",
        "scheduledTime",
        "acceptedAt",
        "pickedUpAt",
        "deliveredAt",
        "completedAt",
        "customerConfirmedAt",
      ].join(" ")
    )
    .populate("rider", "name email profilePicture");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (!canAccessOrder(req, order)) {
    res.status(403);
    throw new Error("Not allowed");
  }

  res.status(200).json({
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    rider: order.rider,
    estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
    scheduledDate: order.scheduledDate,
    scheduledTime: order.scheduledTime,
    acceptedAt: order.acceptedAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    completedAt: order.completedAt,
    customerConfirmedAt: order.customerConfirmedAt,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin: Get all Orders
// @route   GET /api/order?month=2&year=2026&status=pending&paid=false
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getOrders = asyncHandler(async (req, res) => {
  const { month, year, status, fuelType, paid, deliveryStatus, scheduleType } = req.query;

  const filter = {};

  if (status) filter.status = status;
  if (fuelType) filter.fuelType = fuelType;
  if (deliveryStatus) filter.deliveryStatus = deliveryStatus;
  if (scheduleType) filter.scheduleType = scheduleType;
  if (paid !== undefined) filter.paid = paid === "true";

  if (month && year) {
    const { m, y } = parseMonthYear(month, year);
    filter.orderMonth = m;
    filter.orderYear = y;
  }

  const orders = await Order.find(filter)
    .populate("user", "name email")
    .populate("rider", "name email profilePicture")
    .sort({ createdAt: -1 });

  res.status(200).json(orders);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin: Update order status
// @route   PUT /api/order/:id/status
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, deliveryStatus } = req.body;

  const allowedOrderStatuses = ["pending", "processing", "completed", "cancelled", "failed"];
  const allowedDeliveryStatuses = [
    "pending",
    "accepted",
    "picked_up",
    "in_transit",
    "delivered",
    "confirmed",
  ];

  const order = await Order.findById(req.params.id);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (status !== undefined) {
    if (!allowedOrderStatuses.includes(status)) {
      res.status(400);
      throw new Error("Invalid order status");
    }
    order.status = status;
  }

  if (deliveryStatus !== undefined) {
    if (!allowedDeliveryStatuses.includes(deliveryStatus)) {
      res.status(400);
      throw new Error("Invalid delivery status");
    }
    order.deliveryStatus = deliveryStatus;
  }

  if (status === "completed" && !order.completedAt) {
    order.completedAt = new Date();
  }

  const updatedOrder = await order.save();

  res.status(200).json(updatedOrder);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin: Get dashboard stats
// @route   GET /api/order/stats/dashboard
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalOrders,
    pendingOrders,
    processingOrders,
    completedOrders,
    todayOrders,
    monthRevenue,
    unpaidOrders,
    availableDeliveries,
    activeDeliveries,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: "pending" }),
    Order.countDocuments({ status: "processing" }),
    Order.countDocuments({ status: "completed" }),
    Order.countDocuments({ createdAt: { $gte: startOfToday } }),
    Order.aggregate([
      {
        $match: {
          paid: true,
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]),
    Order.countDocuments({ paid: false, status: { $ne: "cancelled" } }),
    Order.countDocuments({
      paid: true,
      status: "processing",
      rider: null,
      deliveryStatus: "pending",
    }),
    Order.countDocuments({
      paid: true,
      status: "processing",
      deliveryStatus: { $in: ["accepted", "picked_up", "in_transit", "delivered"] },
    }),
  ]);

  res.status(200).json({
    totalOrders,
    pendingOrders,
    processingOrders,
    completedOrders,
    todayOrders,
    monthRevenue: monthRevenue[0]?.total || 0,
    unpaidOrders,
    availableDeliveries,
    activeDeliveries,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify payment and get order
// @route   GET /api/order/verify/:reference
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const verifyPaymentAndGetOrder = asyncHandler(async (req, res) => {
  const { reference } = req.params;

  if (!reference) {
    res.status(400);
    throw new Error("Reference is required");
  }

  const data = await verifyPaystackPayment(reference);

  if (!data || data.status !== "success") {
    res.status(400);
    throw new Error("Payment not successful");
  }

  const order = await Order.findOne({ paymentReference: reference })
    .populate("user", "name email")
    .populate("rider", "name email profilePicture");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (!canAccessOrder(req, order)) {
    res.status(403);
    throw new Error("Not allowed");
  }

  if (!order.paid) {
    const expectedKobo = Math.round(Number(order.totalAmount) * 100);

    if (Number(data.amount) !== expectedKobo) {
      res.status(400);
      throw new Error("Payment amount mismatch");
    }

    await order.markAsPaid(reference, "card");
  }

  const refreshedOrder = await Order.findById(order._id)
    .populate("user", "name email")
    .populate("rider", "name email profilePicture");

  res.status(200).json({ order: refreshedOrder });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Initialize payment for an existing order
// @route   POST /api/order/:id/initialize-payment
// @access  Private (protect)
// ─────────────────────────────────────────────────────────────────────────────
const initializePaymentForOrder = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not allowed");
  }

  if (order.paid) {
    res.status(400);
    throw new Error("Order is already paid");
  }

  const amountInKobo = Math.round(Number(order.totalAmount) * 100);
  const reference = `FLX_${order._id}_${Date.now()}`;

  const paystackData = await initializePaystackPayment({
    email: req.user.email,
    amountInKobo,
    reference,
    orderId: order._id,
  });

  const authUrl = paystackData?.authorization_url;
  const paystackRef = paystackData?.reference;

  if (!authUrl || !paystackRef) {
    res.status(502);
    throw new Error("Failed to initialize Paystack payment");
  }

  order.paymentReference = paystackRef;
  order.paymentMethod = "card";
  await order.save();

  res.status(200).json({
    authorization_url: authUrl,
    reference: paystackRef,
    orderId: order._id,
  });
});

export {
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
};