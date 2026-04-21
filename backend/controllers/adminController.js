import Admin from '../models/adminModel.js';
import Rider from '../models/riderModel.js';
import asyncHandler from 'express-async-handler';
import generateToken from '../utils/generateToken.js';
import { OAuth2Client } from 'google-auth-library';


const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const getAdminInfoFromAccessToken = async (accessToken) => {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch admin info from Google');
    return await response.json();
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Google OAuth login for admins
// @route   POST /api/admin/auth/google
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────

const googleAuth = asyncHandler(async (req, res) => {
    const { token: googleToken } = req.body;

    if (!googleToken) {
        res.status(400);
        throw new Error('Google token is required');
    }

    let googleId, email, name, picture;

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken:  googleToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        ({ sub: googleId, email, name, picture } = payload);
    } catch (error) {
        try {
            const adminInfo = await getAdminInfoFromAccessToken(googleToken);
            googleId = adminInfo.sub || `google-${adminInfo.email}`;
            email    = adminInfo.email;
            name     = adminInfo.name;
            picture  = adminInfo.picture;
        } catch (accessError) {
            console.log('Google auth error:', accessError);
            res.status(400);
            throw new Error('Invalid Google token');
        }
    }

    let admin = await Admin.findOne({ $or: [{ googleId }, { email }] });

    if (admin) {
        if (!admin.googleId) {
            admin.googleId    = googleId;
            admin.isVerified  = true;
            await admin.save();
        }
    } else {
        // Admins are not created on the fly via Google —
        // they must be pre-registered by a superadmin.
        res.status(403);
        throw new Error('No admin account found for this Google account. Contact your superadmin.');
    }

    if (!admin || !admin._id) {
        throw new Error('Admin retrieval failed');
    }

    const token = generateToken(res, admin._id);

    res.status(200).json({
        _id:        admin._id,
        name:       admin.name,
        email:      admin.email,
        profile:    admin.profile,
        role:       admin.role,
        authMethod: admin.authMethod,
        token,
        cookieSet:  true,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Register a new admin  (superadmin only)
// @route   POST /api/admin/register
// @access  Private — superadmin
// ─────────────────────────────────────────────────────────────────────────────

const registerAdmin = asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Please provide name, email and password');
    }

    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
        res.status(400);
        throw new Error('An admin with this email already exists');
    }

    const admin = await Admin.create({
        name,
        email,
        password,
        role:       role || 'admin',
        isVerified: true,
        authMethod: 'local',
    });

    if (!admin) {
        res.status(400);
        throw new Error('Invalid admin data');
    }

    res.status(201).json({
        _id:   admin._id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Login admin with email & password
// @route   POST /api/admin/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────

const loginAdmin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400);
        throw new Error('Please provide email and password');
    }

    const admin = await Admin.findOne({ email });

    if (admin && (await admin.matchPassword(password))) {
        const token = generateToken(res, admin._id);

        res.status(200).json({
            _id:        admin._id,
            name:       admin.name,
            email:      admin.email,
            profile:    admin.profile,
            role:       admin.role,
            authMethod: admin.authMethod,
            token,
            cookieSet:  true,
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout admin — clear cookie
// @route   POST /api/admin/logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const logoutAdmin = asyncHandler(async (req, res) => {
    res.cookie('jwt', '', { httpOnly: true, expires: new Date(0) });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get logged-in admin's profile
// @route   GET /api/admin/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const getAdminProfile = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.admin._id).select('-password');

    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    res.status(200).json({
        _id:        admin._id,
        name:       admin.name,
        email:      admin.email,
        profile:    admin.profile,
        role:       admin.role,
        authMethod: admin.authMethod,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update logged-in admin's profile
// @route   PATCH /api/admin/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────

const updateAdminProfile = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.admin._id);

    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    admin.name    = req.body.name    ?? admin.name;
    admin.email   = req.body.email   ?? admin.email;
    admin.profile = req.body.profile ?? admin.profile;

    if (req.body.password) {
        admin.password = req.body.password; // pre('save') re-hashes it
    }

    const updated = await admin.save();
    const token   = generateToken(res, updated._id);

    res.status(200).json({
        _id:       updated._id,
        name:      updated.name,
        email:     updated.email,
        profile:   updated.profile,
        role:      updated.role,
        token,
        cookieSet: true,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// RIDER MANAGEMENT  (dashboard controls)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all riders
 * @route   GET /api/admin/riders
 * @access  Private
 */
const getAllRiders = asyncHandler(async (req, res) => {
    const riders = await Rider.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: riders.length, data: riders });
});

/**
 * @desc    Get a single rider by ID
 * @route   GET /api/admin/riders/:id
 * @access  Private
 */
const getRiderById = asyncHandler(async (req, res) => {
    const rider = await Rider.findById(req.params.id).select('-password');

    if (!rider) {
        res.status(404);
        throw new Error('Rider not found');
    }

    res.status(200).json({ success: true, data: rider });
});

/**
 * @desc    Update any rider's details
 * @route   PATCH /api/admin/riders/:id
 * @access  Private
 */
const updateRider = asyncHandler(async (req, res) => {
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
        res.status(404);
        throw new Error('Rider not found');
    }

    rider.name   = req.body.name   ?? rider.name;
    rider.email  = req.body.email  ?? rider.email;
    rider.status = req.body.status ?? rider.status;

    const updated = await rider.save();

    res.status(200).json({
        success: true,
        data: {
            _id:    updated._id,
            name:   updated.name,
            email:  updated.email,
            status: updated.status,
        },
    });
});

/**
 * @desc    Delete a rider
 * @route   DELETE /api/admin/riders/:id
 * @access  Private — superadmin
 */
const deleteRider = asyncHandler(async (req, res) => {
    const rider = await Rider.findById(req.params.id);

    if (!rider) {
        res.status(404);
        throw new Error('Rider not found');
    }

    await rider.deleteOne();
    res.status(200).json({ success: true, message: 'Rider deleted successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN MANAGEMENT  (superadmin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @desc    Get all admins
 * @route   GET /api/admin/all
 * @access  Private — superadmin
 */
const getAllAdmins = asyncHandler(async (req, res) => {
    const admins = await Admin.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: admins.length, data: admins });
});

/**
 * @desc    Delete an admin
 * @route   DELETE /api/admin/:id
 * @access  Private — superadmin
 */
const deleteAdmin = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    if (admin._id.toString() === req.admin._id.toString()) {
        res.status(400);
        throw new Error('You cannot delete your own account');
    }

    await admin.deleteOne();
    res.status(200).json({ success: true, message: 'Admin deleted successfully' });
});

export {
    googleAuth,
    registerAdmin,
    loginAdmin,
    logoutAdmin,
    getAdminProfile,
    updateAdminProfile,
    getAllRiders,
    getRiderById,
    updateRider,
    deleteRider,
    getAllAdmins,
    deleteAdmin,
};