// controllers/trackController.js
import asyncHandler from "express-async-handler";
import Track from "../models/trackModel.js";
import Order from "../models/orderModel.js";

// If you want route info (ETA / polyline) from Google Directions API
const getGoogleRoute = async ({ origin, destination }) => {
  // origin/destination: { lat, lng }
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;

  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: "driving",
    key: process.env.GOOGLE_MAPS_API_KEY,
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (!resp.ok || data.status !== "OK" || !data.routes?.length) return null;

  const route = data.routes[0];
  const leg = route.legs?.[0];

  return {
    distanceText: leg?.distance?.text,
    durationText: leg?.duration?.text,
    distanceValue: leg?.distance?.value, // meters
    durationValue: leg?.duration?.value, // seconds
    polyline: route?.overview_polyline?.points,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Start tracking (after rider confirms/accepts an order)
// @route   POST /api/tracking/start/:orderId
// @access  Private (Rider)
// NOTE: call this ONLY when rider accepts the order
// ─────────────────────────────────────────────────────────────────────────────
const startTracking = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const riderId = req.rider?._id; // from authenticateRider middleware
  const { userLat, userLng } = req.body; // optional initial user location

  if (!riderId) {
    res.status(401);
    throw new Error("Not authorized as rider");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Assumption: your Order model has user + rider + status fields.
  // If not, add them or adjust below.
  if (!order.user) {
    res.status(400);
    throw new Error("Order has no user attached");
  }

  // Ensure order is confirmed/accepted by THIS rider
  // Adjust these checks to match your schema
  if (order.rider && String(order.rider) !== String(riderId)) {
    res.status(403);
    throw new Error("This order is assigned to another rider");
  }

  // If your app sets order.status to "confirmed"/"accepted" etc:
  // if (order.status !== "confirmed") { ... }
  // For now, we enforce that rider has confirmed by assigning rider on the order:
  order.rider = riderId;
  order.status = order.status ?? "confirmed";
  await order.save();

  // If tracking already exists, just re-activate it
  let tracking = await Tracking.findOne({ order: order._id });

  if (!tracking) {
    tracking = await Tracking.create({
      order: order._id,
      user: order.user,
      rider: riderId,
      status: "active",
      userLocation:
        userLat !== undefined && userLng !== undefined
          ? { lat: userLat, lng: userLng, updatedAt: new Date() }
          : undefined,
    });
  } else {
    tracking.status = "active";
    tracking.rider = riderId;
    tracking.user = order.user;
    if (userLat !== undefined && userLng !== undefined) {
      tracking.userLocation = { lat: userLat, lng: userLng, updatedAt: new Date() };
    }
    await tracking.save();
  }

  res.status(201).json(tracking);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    User updates their live location (so rider can track user)
// @route   PATCH /api/tracking/user-location/:orderId
// @access  Private (User)
// ─────────────────────────────────────────────────────────────────────────────
const updateUserLocation = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user?._id; // from protect middleware
  const { lat, lng } = req.body;

  if (!userId) {
    res.status(401);
    throw new Error("Not authorized as user");
  }

  if (lat === undefined || lng === undefined) {
    res.status(400);
    throw new Error("lat and lng are required");
  }

  const tracking = await Tracking.findOne({ order: orderId });

  if (!tracking) {
    res.status(404);
    throw new Error("Tracking not found for this order");
  }

  if (String(tracking.user) !== String(userId)) {
    res.status(403);
    throw new Error("You can only update your own tracking location");
  }

  tracking.userLocation = { lat, lng, updatedAt: new Date() };
  tracking.lastUpdatedAt = new Date();

  // Optional: compute route if rider location exists
  if (tracking.riderLocation?.lat !== undefined && tracking.riderLocation?.lng !== undefined) {
    const route = await getGoogleRoute({
      origin: tracking.riderLocation,
      destination: tracking.userLocation,
    });
    if (route) tracking.route = route;
  }

  await tracking.save();

  res.status(200).json({ success: true, tracking });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Rider updates their live location (so user can track rider)
// @route   PATCH /api/tracking/rider-location/:orderId
// @access  Private (Rider)
// ─────────────────────────────────────────────────────────────────────────────
const updateRiderLocation = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const riderId = req.rider?._id;
  const { lat, lng } = req.body;

  if (!riderId) {
    res.status(401);
    throw new Error("Not authorized as rider");
  }

  if (lat === undefined || lng === undefined) {
    res.status(400);
    throw new Error("lat and lng are required");
  }

  const tracking = await Tracking.findOne({ order: orderId });

  if (!tracking) {
    res.status(404);
    throw new Error("Tracking not found for this order");
  }

  if (String(tracking.rider) !== String(riderId)) {
    res.status(403);
    throw new Error("You can only update your own rider tracking location");
  }

  if (tracking.status !== "active") {
    res.status(400);
    throw new Error("Tracking is not active");
  }

  tracking.riderLocation = { lat, lng, updatedAt: new Date() };
  tracking.lastUpdatedAt = new Date();

  // Optional: compute route if user location exists
  if (tracking.userLocation?.lat !== undefined && tracking.userLocation?.lng !== undefined) {
    const route = await getGoogleRoute({
      origin: tracking.riderLocation,
      destination: tracking.userLocation,
    });
    if (route) tracking.route = route;
  }

  await tracking.save();

  res.status(200).json({ success: true, tracking });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get tracking details (both user and rider can view)
// @route   GET /api/tracking/:orderId
// @access  Private (User or Rider)
// ─────────────────────────────────────────────────────────────────────────────
const getTracking = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;

  const tracking = await Tracking.findOne({ order: orderId })
    .populate("order")
    .populate("user", "name email")
    .populate("rider", "name email username profile status");

  if (!tracking) {
    res.status(404);
    throw new Error("Tracking not found");
  }

  const requesterUserId = req.user?._id;
  const requesterRiderId = req.rider?._id;

  const isUser = requesterUserId && String(tracking.user) === String(requesterUserId);
  const isRider = requesterRiderId && String(tracking.rider) === String(requesterRiderId);

  if (!isUser && !isRider) {
    res.status(403);
    throw new Error("Not allowed to view this tracking");
  }

  res.status(200).json(tracking);
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Stop tracking (when delivery completed/cancelled)
// @route   PATCH /api/tracking/stop/:orderId
// @access  Private (Rider or Admin)
// ─────────────────────────────────────────────────────────────────────────────
const stopTracking = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;

  const tracking = await Tracking.findOne({ order: orderId });

  if (!tracking) {
    res.status(404);
    throw new Error("Tracking not found");
  }

  // Allow rider who owns it OR admin
  const requesterRiderId = req.rider?._id;
  const requesterAdminId = req.admin?._id;

  const isOwnerRider = requesterRiderId && String(tracking.rider) === String(requesterRiderId);
  const isAdmin = Boolean(requesterAdminId);

  if (!isOwnerRider && !isAdmin) {
    res.status(403);
    throw new Error("Not allowed to stop this tracking");
  }

  tracking.status = "stopped";
  tracking.stoppedAt = new Date();
  tracking.lastUpdatedAt = new Date();

  await tracking.save();

  res.status(200).json({ success: true, tracking });
});

export {
  startTracking,
  updateUserLocation,
  updateRiderLocation,
  getTracking,
  stopTracking,
};