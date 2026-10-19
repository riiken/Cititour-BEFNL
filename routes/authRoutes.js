const express = require('express');
const router = express.Router();

// Controllers
const {
  register,
  login,
  logout,
  refresh,
  getProfile,
  updateProfile,
  changePassword,
  getUsage,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validation');

// Validation middleware
const {
  validateRegister,
  validateLogin,
  validateRefreshToken,
  validatePasswordChange,
  validateProfileUpdate
} = require('../middleware/validation');

// Auth middleware
const { authenticate, optionalAuth } = require('../middleware/auth');

// Rate limiters
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');

// ============================================
// PUBLIC ROUTES (NO AUTHENTICATION REQUIRED)
// ============================================

/**
 * POST /api/auth/register
 * Register a new user account
 * Rate Limited: 10 requests/hour per IP
 */
router.post('/register',
  authLimiter,          // Prevent registration spam
  validateRegister,     // Validate registration data
  register              // Create new user
);

/**
 * POST /api/auth/login
 * Login with email and password
 * Rate Limited: 10 requests/hour per IP
 */
router.post('/login',
  authLimiter,          // Prevent brute force attacks
  validateLogin,        // Validate login credentials
  login                 // Authenticate user
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Rate Limited: 10 requests/hour per IP
 */
router.post('/refresh',
  authLimiter,            // Prevent token refresh spam
  validateRefreshToken,   // Validate refresh token
  refresh                 // Issue new tokens
);

/**
 * POST /api/auth/forgot-password
 * Email a password reset link (same response whether or not the email exists)
 */
router.post('/forgot-password',
  strictLimiter,
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail(),
  validateRequest,
  forgotPassword
);

/**
 * POST /api/auth/reset-password
 * Set a new password using the emailed token
 */
router.post('/reset-password',
  authLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  body('token').isString().isLength({ min: 64, max: 64 }).isHexadecimal().withMessage('Invalid reset link'),
  body('password')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  validateRequest,
  resetPassword
);

// ============================================
// PROTECTED ROUTES (AUTHENTICATION REQUIRED)
// ============================================

/**
 * POST /api/auth/logout
 * Logout (invalidate refresh token)
 * Requires: Valid access token
 */
router.post('/logout',
  optionalAuth,     // Access token if still valid; otherwise the refresh token in the body
  logout            // Invalidate the refresh token
);

/**
 * GET /api/auth/me
 * Get current user profile
 * Requires: Valid access token
 */
router.get('/me',
  authenticate,     // Verify user is logged in
  getProfile        // Return user profile
);

/**
 * PATCH /api/auth/profile
 * Update user profile
 * Requires: Valid access token
 */
router.patch('/profile',
  authenticate,           // Verify user is logged in
  validateProfileUpdate,  // Validate update data
  updateProfile           // Update user profile
);

/**
 * POST /api/auth/change-password
 * Change user password
 * Requires: Valid access token
 */
router.post('/change-password',
  authenticate,             // Verify user is logged in
  validatePasswordChange,   // Validate passwords
  changePassword            // Update password
);

/**
 * GET /api/auth/usage
 * Get user usage statistics and rate limits
 * Requires: Valid access token
 */
router.get('/usage',
  authenticate,     // Verify user is logged in
  getUsage          // Return usage stats
);

module.exports = router;
