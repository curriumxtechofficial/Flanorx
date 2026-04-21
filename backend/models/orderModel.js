// models/orderModel.js
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // who placed the order (customer)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // human-friendly order id (not Mongo _id)
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: () =>
        `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    },

    // order date/time
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // for filtering by month/year quickly
    orderYear: {
      type: Number,
      required: true,
    },

    orderMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    // Step 1: Fuel Type
    fuelType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Petrol", "Diesel"],
    },

    fuelPricePerLiter: {
      type: Number,
      required: true,
      min: 0,
    },

    // Step 2: Filling Station
    fillingStation: {
      type: String,
      required: true,
      trim: true,
    },

    // Step 3: Quantity
    quantity: {
      type: Number,
      required: true,
      min: 5,
      max: 500,
    },

    // Step 4: Delivery Location
    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional: Store coordinates if using current location
    deliveryCoordinates: {
      lat: {
        type: Number,
        default: null,
      },
      lng: {
        type: Number,
        default: null,
      },
    },

    // Step 5: Schedule
    scheduleType: {
      type: String,
      required: true,
      enum: ["now", "scheduled"],
      default: "now",
    },

    scheduledDate: {
      type: Date,
      default: null,
    },

    scheduledTime: {
      type: String,
      default: "",
    },

    // Payment Information
    paid: {
      type: Boolean,
      required: true,
      default: false,
    },

    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer", "wallet"],
      default: "card",
    },

    paymentReference: {
      type: String,
      trim: true,
      default: "",
    },

    paymentDate: {
      type: Date,
      default: null,
    },

    // Price Breakdown
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryFee: {
      type: Number,
      required: true,
      default: 4.99,
      min: 0,
    },

    serviceTax: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Order Status
    status: {
      type: String,
      required: true,
      default: "pending",
      enum: ["pending", "processing", "completed", "cancelled", "failed"],
    },

    // Delivery Status
    deliveryStatus: {
      type: String,
      enum: ["pending", "accepted", "picked_up", "in_transit", "delivered", "confirmed"],
      default: "pending",
    },

    // Assigned rider
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      default: null,
    },

    // Estimated delivery time
    estimatedDeliveryMinutes: {
      type: Number,
      min: 0,
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    pickedUpAt: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    customerConfirmedAt: {
      type: Date,
      default: null,
    },

    riderCommission: {
      type: Number,
      default: 0,
      min: 0,
    },

    commissionPaidToRider: {
      type: Boolean,
      default: false,
    },

    deliveryAcceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      default: null,
    },

    // Any special instructions from customer
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-fill orderYear & orderMonth based on date
orderSchema.pre("validate", function () {
  const d = this.date ? new Date(this.date) : new Date();

  this.orderYear = d.getFullYear();
  this.orderMonth = d.getMonth() + 1;

  if (this.scheduleType === "scheduled" && !this.scheduledDate) {
    throw new Error("Scheduled date is required when schedule type is 'scheduled'");
  }
});

// Method to mark order as paid
orderSchema.methods.markAsPaid = function (paymentReference, paymentMethod) {
  this.paid = true;
  this.paymentDate = new Date();
  this.paymentReference = paymentReference;
  this.paymentMethod = paymentMethod;
  this.status = "processing";
  this.deliveryStatus = "pending";
  return this.save();
};

// Static method to calculate price based on fuel type and quantity
orderSchema.statics.calculatePrice = function (fuelType, quantity) {
  const prices = {
    "Petrol (95 Octane)": 850,
    Diesel: 1320,
  };

  const pricePerLiter = prices[fuelType] || 0;
  const subtotal = pricePerLiter * quantity;
  const deliveryFee = 4.99;
  const serviceTax = subtotal * 0.05;
  const total = subtotal + deliveryFee + serviceTax;

  return {
    pricePerLiter,
    subtotal,
    deliveryFee,
    serviceTax,
    total,
  };
};

// Indexes
orderSchema.index({ user: 1, orderYear: 1, orderMonth: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paid: 1 });
orderSchema.index({ deliveryStatus: 1 });
orderSchema.index({ rider: 1, deliveryStatus: 1, status: 1 });
orderSchema.index({ paid: 1, rider: 1, deliveryStatus: 1 });

const Order = mongoose.model("Order", orderSchema);

export default Order;