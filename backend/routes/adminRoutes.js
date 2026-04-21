import express from 'express';
import {
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
} from '../controllers/adminController.js';
import {
    authenticateAdmin,
    requireSuperAdmin
} from '../middleware/authMiddleware.js';

const router = express.Router();


router.post('/auth/google', googleAuth);
router.post('/login',       loginAdmin);

router.post  ('/logout',  authenticateAdmin, logoutAdmin);
router.get   ('/me',      authenticateAdmin, getAdminProfile);
router.patch ('/me',      authenticateAdmin, updateAdminProfile);

// Rider management
router.get   ('/riders',     authenticateAdmin, getAllRiders);
router.get   ('/riders/:id', authenticateAdmin, getRiderById);
router.patch ('/riders/:id', authenticateAdmin, updateRider);


router.post  ('/register',    authenticateAdmin, requireSuperAdmin, registerAdmin);
router.delete('/riders/:id',  authenticateAdmin, requireSuperAdmin, deleteRider);
router.get   ('/all',         authenticateAdmin, requireSuperAdmin, getAllAdmins);
router.delete('/:id',         authenticateAdmin, requireSuperAdmin, deleteAdmin);

export default router;