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

// ============================================
// AI ROUTES WITH VALIDATION & RATE LIMITING
// ============================================

/**
 * POST /api/ai/query
 * Generate AI travel recommendations
 * Rate Limited: 20 requests/hour
 */
router.post('/query',
  aiLimiter,           // Apply AI-specific rate limiting
  validateAIQuery,     // Validate query input
  handleQuery          // Handle request
);

/**
 * POST /api/ai/recommendlocation
 * Search hotels, restaurants, tours for a location
 * Rate Limited: 50 requests/15min
 */
router.post('/recommendlocation',
  searchLimiter,          // Apply search-specific rate limiting
  validateLocationSearch, // Validate location input
  fetchHotels            // Handle request
);

/**
 * POST /api/ai/sendEmail
 * Send contact form email
 * Rate Limited: 5 requests/hour (prevent spam)
 */
router.post('/sendEmail',
  emailLimiter,      // Apply strict email rate limiting
  validateEmail,     // Validate email fields
  sendEmail          // Handle request
);

/**
 * POST /api/ai/popularLocation
 * Get popular destinations with images
 * Rate Limited: 50 requests/15min
 */
router.post('/popularLocation',
  searchLimiter,            // Apply search-specific rate limiting
  validatePopularLocation,  // Validate location input
  fetchImageFromPexels     // Handle request
);

module.exports = router;
