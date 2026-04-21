import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import userRoutes from "./routes/userRoutes.js";
import riderRoutes from "./routes/riderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";

import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const MONGO_URL = process.env.MONGO_URL;

// ✅ Parse first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ CORS FIRST (must be before routes)
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['http://127.0.0.1:5500', 'https://flanorx2.onrender.com', 'https://flanorx.vercel.app']
    : ['http://127.0.0.1:5500', 'https://flanorx2.onrender.com', 'https://flanorx.vercel.app'];

app.use(cors({
    origin: function(origin, callback) {
        // allow requests with no origin (mobile apps, curl)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Instead of throwing an error, just deny
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));


// ✅ Health test endpoint
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Backend is reachable" });
});

// ✅ Routes
app.use("/api/users", userRoutes);
app.use("/api/riders", riderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/delivery", deliveryRoutes);

// ✅ Error middleware order (notFound first)
app.use(notFound);
app.use(errorHandler);

// ✅ Mongo + server start
mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`✅ Server running on http://0.0.0.0:${PORT}`)
    );
  })
  .catch((err) => console.error("❌ Mongo error:", err.message));