// models/trackModel.js
import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    distanceText: { type: String },
    durationText: { type: String },
    distanceValue: { type: Number }, // meters
    durationValue: { type: Number }, // seconds
    polyline: { type: String }, // Google encoded polyline
  },
  { _id: false }
);

const trackSchema = new mongoose.Schema(
  {
    // One tracking per order
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },

    // Who placed the order
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Assigned/confirmed rider
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },

    // tracking lifecycle
    status: {
      type: String,
      enum: ["active", "stopped"],
      default: "active",
    },

    // Live positions
    userLocation: {
      type: locationSchema,
      default: undefined,
    },

    riderLocation: {
      type: locationSchema,
      default: undefined,
    },

    // Optional: route/ETA computed from Google Directions API
    route: {
      type: routeSchema,
      default: undefined,
    },

    // metadata
    lastUpdatedAt: { type: Date, default: Date.now },
    stoppedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

const Track = mongoose.model("Track", trackSchema);

export default Track;