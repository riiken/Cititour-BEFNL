const express = require('express');
const router = express.Router();

// Controllers
const { handleQuery } = require('../controllers/aiController');
const { fetchHotels } = require('../controllers/searchResultsController');
const { sendEmail } = require('../controllers/sendEmailController');

// Validation middleware
const {
  validateAIQuery,
  validateLocationSearch,
  validateEmail
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
  aiLimiter,           // Apply AI-specific rate limiting
  validateAIQuery,     // Validate query input
  trackUsage('ai'),    // Count only requests that passed limits and validation
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
  searchLimiter,          // Apply search-specific rate limiting
  validateLocationSearch, // Validate location input (accepts `location` or `place`)
  trackUsage('search'),   // Count only requests that passed limits and validation
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
  emailLimiter,        // Apply strict email rate limiting
  validateEmail,       // Validate email fields
  trackUsage('email'), // Count only requests that passed limits and validation
  sendEmail            // Handle request
);

/**
 * POST /api/ai/popularLocation
 * Retired: this route never returned a response (it was wired to an image
 * helper) and its AI-invented "discounts" are not shown anywhere.
 */
router.post('/popularLocation', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'This endpoint has been retired.'
  });
});

module.exports = router;
