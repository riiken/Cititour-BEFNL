const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { authenticate, optionalAuth, requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { LISTING_TYPES, SUBTYPES, STATUSES } = require('../model/Listing');
const controller = require('../controllers/listingController');

const router = express.Router();

const TEXT = /^[\p{L}\p{M}\p{N}\s,.'’&()\/:;!?+#@%₹-]*$/u;
const PHONE = /^\+?[\d\s()-]{8,20}$/;
const ALL_SUBTYPES = Object.values(SUBTYPES).flat();

const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const leadLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const geocodeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const id = param('id').isMongoId().withMessage('Invalid id');

/**
 * Listing fields. `creating` makes the core fields required.
 */
const listingRules = (creating) => {
  const req = (chain) => (creating ? chain.exists({ values: 'falsy' }) : chain.optional());
  return [
    req(body('type')).isIn(LISTING_TYPES).withMessage(`Type must be one of: ${LISTING_TYPES.join(', ')}`),
    body('subtype').optional({ values: 'falsy' }).isIn(ALL_SUBTYPES).withMessage('Unknown category')
      .custom((value, { req: request }) => !request.body.type || (SUBTYPES[request.body.type] || []).includes(value))
      .withMessage('Category does not match the business type'),
    req(body('name')).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Name must be 2-120 characters')
      .matches(TEXT).withMessage('Name contains invalid characters'),
    body('description').optional().isString().trim().isLength({ max: 1500 }).withMessage('Description is too long (max 1500)'),
    req(body('city')).isString().trim().isLength({ min: 2, max: 100 }).withMessage('City is required')
      .matches(TEXT).withMessage('City contains invalid characters'),
    body('address').optional().isString().trim().isLength({ max: 250 }),
    req(body('lat')).isFloat({ min: -90, max: 90 }).withMessage('Set the location on the map').toFloat(),
    req(body('lon')).isFloat({ min: -180, max: 180 }).withMessage('Set the location on the map').toFloat(),
    body('priceMin').optional({ values: 'null' }).isFloat({ min: 0, max: 10000000 }).toFloat(),
    body('priceMax').optional({ values: 'null' }).isFloat({ min: 0, max: 10000000 }).toFloat()
      .custom((value, { req: request }) => request.body.priceMin === undefined || request.body.priceMin === null || value >= request.body.priceMin)
      .withMessage('Maximum price must be at least the minimum price'),
    body('priceUnit').optional({ values: 'falsy' }).isIn(['night', 'person', 'group', 'activity']),
    body('amenities').optional().isArray({ max: 25 }),
    body('amenities.*').optional().isString().trim().isLength({ min: 2, max: 40 }).matches(TEXT),
    body('cuisines').optional().isArray({ max: 10 }),
    body('cuisines.*').optional().isString().trim().isLength({ min: 2, max: 40 }).matches(TEXT),
    body('vegOnly').optional().isBoolean().toBoolean(),
    body('duration').optional().isString().trim().isLength({ max: 60 }),
    body('openingHours').optional().isString().trim().isLength({ max: 120 }),
    body('contact').optional().isObject(),
    body('contact.phone').optional({ values: 'falsy' }).matches(PHONE).withMessage('Enter a valid phone number'),
    body('contact.whatsapp').optional({ values: 'falsy' }).matches(PHONE).withMessage('Enter a valid WhatsApp number'),
    body('contact.email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('contact.website').optional({ values: 'falsy' }).isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Website must start with http:// or https://'),
    body('contact.bookingUrl').optional({ values: 'falsy' }).isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Booking link must start with http:// or https://'),
    ...(creating ? [
      body('contact').custom((contact) => Boolean(contact && (contact.phone || contact.whatsapp || contact.website || contact.bookingUrl)))
        .withMessage('Add a phone, WhatsApp number or website so travellers can reach you')
    ] : []),
    validateRequest
  ];
};

// ---------------------------------------------------------------- partner (owner)
router.get('/partner/listings', authenticate, controller.listMyListings);
router.post('/partner/listings', authenticate, writeLimiter, listingRules(true), controller.createListing);
router.get('/partner/listings/:id', authenticate, id, validateRequest, controller.getMyListing);
router.patch('/partner/listings/:id', authenticate, writeLimiter, id, listingRules(false), controller.updateListing);
router.post('/partner/listings/:id/pause', authenticate, id, body('paused').isBoolean(), validateRequest, controller.setPaused);
router.delete('/partner/listings/:id', authenticate, id, validateRequest, controller.deleteListing);

// Photos are sent as raw image bytes (client-resized), outside the 100 KB JSON limit
router.post('/partner/listings/:id/photos',
  authenticate,
  writeLimiter,
  id,
  validateRequest,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '600kb' }),
  controller.uploadPhoto
);
router.delete('/partner/listings/:id/photos/:photoId',
  authenticate, id, param('photoId').isMongoId(), validateRequest, controller.deletePhoto);

// ---------------------------------------------------------------- public
router.get('/photos/:id', controller.getPhoto);
router.get('/listings', query('type').optional().isIn(LISTING_TYPES), query('city').optional().isString().isLength({ max: 100 }),
  validateRequest, controller.searchPublicListings);
router.get('/listings/:id', id, validateRequest, controller.getPublicListing);
router.post('/listings/:id/lead',
  leadLimiter,
  express.json({ type: ['application/json', 'text/plain'], limit: '2kb' }), // beacon payloads
  optionalAuth,
  id,
  body('channel').isIn(['whatsapp', 'call', 'website', 'email']),
  body('placement').optional().isString().isLength({ max: 40 }).matches(/^[a-z_]+$/),
  body('itineraryId').optional().isString().isLength({ max: 20 }).matches(/^[A-Za-z0-9_-]+$/),
  validateRequest,
  controller.recordLead
);
router.get('/geocode', geocodeLimiter, query('q').isString().trim().isLength({ min: 3, max: 200 }),
  query('country').optional().isIn(['in', 'any']), validateRequest, controller.geocodeLookup);
router.get('/geocode/reverse', geocodeLimiter,
  query('lat').isFloat({ min: -90, max: 90 }), query('lon').isFloat({ min: -180, max: 180 }), validateRequest, controller.reverseLookup);
router.post('/geocode/link', authenticate, geocodeLimiter,
  body('link').isString().trim().isLength({ min: 5, max: 600 }).withMessage('Paste a Google Maps link'), validateRequest, controller.locationFromLink);

// ---------------------------------------------------------------- admin
router.get('/admin/overview', authenticate, requireAdmin, controller.adminOverview);
router.get('/admin/listings', authenticate, requireAdmin, query('status').optional().isIn(STATUSES), validateRequest,
  controller.adminListListings);
router.post('/admin/listings/:id/approve', authenticate, requireAdmin, id, validateRequest, controller.adminReview('approve'));
router.post('/admin/listings/:id/reject', authenticate, requireAdmin, id,
  body('reason').isString().trim().isLength({ min: 3, max: 300 }).withMessage('Give a short reason (shown to the owner)'),
  validateRequest, controller.adminReview('reject'));
router.post('/admin/listings/:id/feature', authenticate, requireAdmin, id,
  body('featured').isBoolean(), body('until').optional({ values: 'falsy' }).isISO8601(),
  validateRequest, controller.adminReview('feature'));

module.exports = router;
