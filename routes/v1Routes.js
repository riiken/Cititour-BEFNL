const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { authenticate, optionalAuth, trackUsage } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { validateRequest } = require('../middleware/validation');
const { createItinerary, getItinerary, calendar, packing, recordEvent } = require('../controllers/itineraryController');
const listingRoutes = require('./listingRoutes');
const tripEdit = require('../controllers/tripEditController');
const { explore } = require('../controllers/exploreController');

const router = express.Router();

const PLACE_PATTERN = /^[\p{L}\p{M}\p{N}\s,.'’()-]+$/u;
const MAX_TRIP_DAYS = 14;

const validateItineraryRequest = [
  body('destination').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Destination must be 2-100 characters')
    .matches(PLACE_PATTERN).withMessage('Destination contains invalid characters'),
  body('checkIn').isISO8601({ strict: true }).withMessage('Start date must be YYYY-MM-DD')
    .custom((value) => {
      const start = new Date(`${value}T00:00:00Z`);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (start < new Date(today.getTime() - 86400000)) throw new Error('Start date cannot be in the past');
      if (start > new Date(today.getTime() + 2 * 365 * 86400000)) throw new Error('Start date is too far ahead');
      return true;
    }),
  body('checkOut').isISO8601({ strict: true }).withMessage('End date must be YYYY-MM-DD')
    .custom((value, { req }) => {
      const nights = (new Date(`${value}T00:00:00Z`) - new Date(`${req.body.checkIn}T00:00:00Z`)) / 86400000;
      if (!(nights >= 1)) throw new Error('End date must be after the start date');
      if (nights > MAX_TRIP_DAYS) throw new Error(`Trips can be up to ${MAX_TRIP_DAYS} nights`);
      return true;
    }),
  body('travellers').optional().isInt({ min: 1, max: 30 }).toInt(),
  body('budget').optional().isIn(['Budget', 'Mid-range', 'Luxury']).withMessage('Budget must be Budget, Mid-range or Luxury'),
  body('interests').optional().isArray({ max: 10 }),
  body('interests.*').optional().isString().trim().isLength({ min: 2, max: 40 }).matches(PLACE_PATTERN),
  validateRequest
];

const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

const validateEvent = [
  body('type').isIn(['outbound_click', 'share', 'plan_view']),
  body('partner').optional().isString().isLength({ max: 30 }).matches(/^[a-z_]+$/),
  body('placement').optional().isString().isLength({ max: 40 }).matches(/^[a-z_]+$/),
  body('itineraryId').optional().isString().isLength({ max: 20 }).matches(/^[A-Za-z0-9_-]+$/),
  body('destination').optional().isString().trim().isLength({ max: 100 }),
  validateRequest
];

/**
 * POST /api/v1/itineraries
 * Create a day-by-day plan from real places. Counts against the AI quota.
 */
router.post('/itineraries',
  optionalAuth,
  aiLimiter,
  validateItineraryRequest,
  trackUsage('ai'),
  createItinerary
);

/**
 * GET /api/v1/itineraries/:id
 * Public, shareable read of a plan by its unguessable id.
 */
router.get('/itineraries/:id',
  optionalAuth,
  param('id').isString().isLength({ min: 8, max: 20 }).matches(/^[A-Za-z0-9_-]+$/),
  validateRequest,
  getItinerary
);

// ---------------------------------------------------------------- explore
const exploreLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

/**
 * GET /api/v1/explore/:destination
 * Real places to see, do, stay and eat for a destination (cached/free data only).
 */
router.get('/explore/:destination',
  exploreLimiter,
  optionalAuth,
  param('destination').isString().trim().isLength({ min: 2, max: 100 }).matches(PLACE_PATTERN),
  query('checkIn').optional().isISO8601({ strict: true }),
  query('checkOut').optional().isISO8601({ strict: true }),
  query('travellers').optional().isInt({ min: 1, max: 30 }).toInt(),
  validateRequest,
  explore
);

// ---------------------------------------------------------------- my trips & editing
const tripId = param('id').isString().isLength({ min: 8, max: 20 }).matches(/^[A-Za-z0-9_-]+$/);
const SLOTS = ['morning', 'lunch', 'afternoon', 'evening', 'dinner'];
const editLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get('/itineraries/:id/calendar.ics', tripId, validateRequest, calendar);
router.get('/itineraries/:id/packing', tripId, validateRequest, packing);
router.get('/me/trips', authenticate, tripEdit.myTrips);
router.post('/itineraries/:id/copy', authenticate, tripId, validateRequest, tripEdit.saveCopy);
router.delete('/itineraries/:id', authenticate, tripId, validateRequest, tripEdit.deleteTrip);
router.get('/itineraries/:id/alternatives', authenticate, tripId,
  query('group').isIn(['activity', 'meal', 'stay']),
  query('day').optional().isInt({ min: 1, max: 20 }),
  validateRequest, tripEdit.alternatives);
router.patch('/itineraries/:id', authenticate, editLimiter, tripId,
  body('op').isIn(['remove', 'move', 'add', 'replace', 'stay_remove', 'stay_add', 'title']),
  body('day').optional().isInt({ min: 1, max: 20 }).toInt(),
  body('toDay').optional().isInt({ min: 1, max: 20 }).toInt(),
  body('index').optional().isInt({ min: 0, max: 50 }).toInt(),
  body('slot').optional().isIn(SLOTS),
  body('place').optional().isObject(),
  body('place.kind').optional().isIn(['attraction', 'tour', 'restaurant', 'hotel', 'area']),
  body('place.name').optional().isString().isLength({ min: 1, max: 160 }),
  body('title').optional().isString().trim().isLength({ min: 2, max: 100 }),
  validateRequest, tripEdit.updateTrip);

/**
 * POST /api/v1/events
 * First-party click/share tracking (no personal data).
 */
// navigator.sendBeacon sends text/plain (a CORS-safelisted type) to avoid preflights
const beaconJson = express.json({ type: ['application/json', 'text/plain'], limit: '2kb' });

router.post('/events', eventLimiter, beaconJson, optionalAuth, validateEvent, recordEvent);

// Business listings: partner portal, public listings, admin moderation
router.use(listingRoutes);

module.exports = router;
