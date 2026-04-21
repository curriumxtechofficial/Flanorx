import express from "express";
import { googleAuth, logoutUser } from "../controllers/userController.js";

const router = express.Router();

router.post("/google", googleAuth);
router.post("/logout", logoutUser);

export default router;