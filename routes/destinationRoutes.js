const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const destinationController = require('../controllers/destinationController');
const { optionalAuth, trackUsage } = require('../middleware/auth');

/**
 * Rate limiters for destination endpoints
 */

// General destination data (more generous limit)
const destinationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per 15 minutes
  message: {
    success: false,
    message: 'Too many destination requests. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Search endpoint (slightly more restrictive)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many search requests. Please try again in 15 minutes.'
  }
});

// Weather and images (more restrictive due to external API limits)
const externalApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 40, // 40 requests per hour
  message: {
    success: false,
    message: 'Too many weather/image requests. Please try again in 1 hour.'
  }
});

/**
 * Destination Routes
 */

// Search destinations
// GET /api/destinations/search?q=tokyo&limit=5
router.get('/search',
  optionalAuth,
  trackUsage('search'),
  searchLimiter,
  destinationController.searchDestinations
);

// Get comprehensive destination data
// GET /api/destinations/:name?includeWeather=true&includeImages=true&includeForecast=true&units=metric
router.get('/:name',
  optionalAuth,
  trackUsage('search'),
  destinationLimiter,
  destinationController.getDestination
);

// Get travel planning data (comprehensive with recommendations)
// GET /api/destinations/:name/travel?units=metric
router.get('/:name/travel',
  optionalAuth,
  trackUsage('search'),
  destinationLimiter,
  destinationController.getTravelPlanningData
);

// Get quick overview (fast, minimal data)
// GET /api/destinations/:name/quick
router.get('/:name/quick',
  optionalAuth,
  trackUsage('search'),
  destinationLimiter,
  destinationController.getQuickOverview
);

// Get destination images
// GET /api/destinations/:name/images?count=10
router.get('/:name/images',
  optionalAuth,
  trackUsage('search'),
  externalApiLimiter,
  destinationController.getDestinationImages
);

// Get current weather
// GET /api/destinations/:name/weather?units=metric
router.get('/:name/weather',
  optionalAuth,
  trackUsage('search'),
  externalApiLimiter,
  destinationController.getDestinationWeather
);

// Get weather forecast
// GET /api/destinations/:name/forecast?units=metric
router.get('/:name/forecast',
  optionalAuth,
  trackUsage('search'),
  externalApiLimiter,
  destinationController.getDestinationForecast
);

// Get Wikipedia info
// GET /api/destinations/:name/info
router.get('/:name/info',
  optionalAuth,
  trackUsage('search'),
  destinationLimiter,
  destinationController.getDestinationInfo
);

module.exports = router;
