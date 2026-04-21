import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const riderSchema = mongoose.Schema(
  {
    name: { type: String, required: true },

    email: { type: String, required: true, unique: true },

    password: { type: String, required: true },

    nin: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },

    proofOfAddress: {
      type: String,
      default: "",
    },

    fuelingStation: {
      type: String,
      default: "",
    },

    profilePicture: {
      type: String,
      default: "",
    },

    verificationStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    rejectionReason: { type: String, default: "" },
    walletBalance: {
      type: Number,
      default: 0,
    },

    bankAccountNumber: {
      type: String,
      default: "",
    },

    accountName: {
      type: String,
      default: "",
    },

    bankName: {
      type: String,
      default: "",
    },

    paystackSubaccountCode: {
      type: String,
      default: "",
    },

    googleId: {
      type: String,
      default: "",
    },

    authMethod: {
      type: String,
      default: "local",
    },

    totalEarnings: {
      type: Number,
      default: 0,
    },

    completedDeliveries: {
      type: Number,
      default: 0,
    },

    activeDelivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Hash password before saving
riderSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(7);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
riderSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const Rider = mongoose.model("Rider", riderSchema);

export default Rider;
