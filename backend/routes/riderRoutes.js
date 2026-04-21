import express from "express";
import {
  riderGoogleAuth,
  submitRiderVerification,
  logoutRider,
  getRiderProfile,
  updateRiderProfile,
  updateRiderStatus,
  updateRiderLocation,
} from "../controllers/riderController.js";
import { authenticateRider } from "../middleware/authMiddleware.js";

import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const router = express.Router();

// ✅ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// ✅ Cloudinary storage (multer)
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "flanorx_rider_credentials",
    allowed_formats: ["jpg", "png", "jpeg"],
  }),
});

const upload = multer({ storage });

// ✅ Ping cloudinary (fixed catch param)
cloudinary.api
  .ping()
  .then(() => console.log("✅ Cloudinary connected successfully"))
  .catch((err) => console.error("❌ Cloudinary not connected:", err?.message));

router.post("/auth/google", riderGoogleAuth);

router.put(
  "/verification-registration",
  authenticateRider,
  upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "ninPicture", maxCount: 1 },
    { name: "proofOfAddress", maxCount: 1 },
  ]),
  submitRiderVerification
);

router.post("/logout", authenticateRider, logoutRider);
router.get("/me", authenticateRider, getRiderProfile);
router.patch("/me", authenticateRider, updateRiderProfile);
router.patch("/status", authenticateRider, updateRiderStatus);
router.patch("/location", authenticateRider, updateRiderLocation);

export default router;