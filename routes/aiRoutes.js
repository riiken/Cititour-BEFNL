const express = require('express');
const router = express.Router();

// Controllers
const { handleQuery } = require('../controllers/aiController');
const { fetchHotels } = require('../controllers/searchResultsController');
const { sendEmail } = require('../controllers/sendEmailController');
const { getPopularLocation, fetchImageFromPexels } = require('../controllers/popularDestinationController');

// Validation middleware
const {
  validateAIQuery,
  validateLocationSearch,
  validateEmail,
  validatePopularLocation
} = require('../middleware/validation');

// Rate limiters
const {
  aiLimiter,
  searchLimiter,
  emailLimiter
} = require('../middleware/rateLimiter');

// Authentication middleware
const { optionalAuth, trackUsage } = require('../middleware/auth');

// ============================================
// AI ROUTES WITH VALIDATION & RATE LIMITING
// ============================================

/**
 * POST /api/ai/query
 * Generate AI travel recommendations
 * Rate Limited: 20 requests/hour (guest) or per-tier limit (authenticated)
 * Optional Authentication: Tracks usage for logged-in users
 */
router.post('/query',
  optionalAuth,        // Optional authentication (allows guests)
  trackUsage('ai'),    // Track AI usage for authenticated users
  aiLimiter,           // Apply AI-specific rate limiting
  validateAIQuery,     // Validate query input
  handleQuery          // Handle request
);

/**
 * POST /api/ai/recommendlocation
 * Search hotels, restaurants, tours for a location
 * Rate Limited: 50 requests/15min (guest) or per-tier limit (authenticated)
 * Optional Authentication: Tracks usage for logged-in users
 */
router.post('/recommendlocation',
  optionalAuth,           // Optional authentication
  trackUsage('search'),   // Track search usage
  searchLimiter,          // Apply search-specific rate limiting
  validateLocationSearch, // Validate location input
  fetchHotels            // Handle request
);

/**
 * POST /api/ai/sendEmail
 * Send contact form email
 * Rate Limited: 5 requests/hour (prevent spam)
 * Optional Authentication: Tracks usage for logged-in users
 */
router.post('/sendEmail',
  optionalAuth,        // Optional authentication
  trackUsage('email'), // Track email usage
  emailLimiter,        // Apply strict email rate limiting
  validateEmail,       // Validate email fields
  sendEmail            // Handle request
);

/**
 * POST /api/ai/popularLocation
 * Get popular destinations with images
 * Rate Limited: 50 requests/15min (guest) or per-tier limit (authenticated)
 * Optional Authentication: Tracks usage for logged-in users
 */
router.post('/popularLocation',
  optionalAuth,             // Optional authentication
  trackUsage('search'),     // Track search usage
  searchLimiter,            // Apply search-specific rate limiting
  validatePopularLocation,  // Validate location input
  fetchImageFromPexels     // Handle request
);

module.exports = router;
