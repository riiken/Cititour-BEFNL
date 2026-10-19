const { body, query, param, validationResult } = require('express-validator');

/**
 * Middleware to check validation results and return errors
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// ============================================
// VALIDATION RULES FOR AI ENDPOINTS
// ============================================

/**
 * Validate AI query endpoint
 * POST /api/ai/query
 */
// Letters/numbers in any script (Hindi, accented names, ...) plus common punctuation
const TEXT_PATTERN = /^[\p{L}\p{M}\p{N}\s,?.!'’&:;()\/₹$€£%+-]+$/u;
const PLACE_PATTERN = /^[\p{L}\p{M}\p{N}\s,.'’()-]+$/u;

const validateAIQuery = [
  body('query')
    .trim()
    .notEmpty()
    .withMessage('Query is required')
    .isLength({ min: 3, max: 500 })
    .withMessage('Query must be between 3 and 500 characters')
    .matches(TEXT_PATTERN)
    .withMessage('Query contains invalid characters'),

  // Optional structured trip details (newer clients)
  body('destination').optional().trim().isLength({ min: 2, max: 100 }).matches(PLACE_PATTERN)
    .withMessage('Destination contains invalid characters'),
  body('checkIn').optional().isISO8601({ strict: true }).withMessage('checkIn must be YYYY-MM-DD'),
  body('checkOut').optional().isISO8601({ strict: true }).withMessage('checkOut must be YYYY-MM-DD'),
  body('travellers').optional().isInt({ min: 1, max: 30 }).toInt(),
  body('budget').optional().trim().isLength({ max: 60 }).matches(TEXT_PATTERN),
  body('interests').optional().isArray({ max: 10 }),
  body('interests.*').optional().trim().isLength({ min: 2, max: 40 }).matches(PLACE_PATTERN),
  validateRequest
];

/**
 * Validate location search endpoint
 * POST /api/ai/recommendlocation
 */
// Clients have sent the city as `location` (web/Android app) and as `place`.
// Accept either and normalise to `location`, which the controller reads.
const normaliseLocationField = (req, res, next) => {
  if (req.body && !req.body.location && req.body.place) {
    req.body.location = req.body.place;
  }
  next();
};

const validateLocationSearch = [
  normaliseLocationField,
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters')
    .matches(PLACE_PATTERN)
    .withMessage('Location contains invalid characters'),

  body('sort').optional().isString().isLength({ max: 30 }),

  body('checkIn')
    .optional()
    .isISO8601()
    .withMessage('Check-in must be a valid date (YYYY-MM-DD)')
    .custom((value) => {
      const checkInDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (checkInDate < today) {
        throw new Error('Check-in date cannot be in the past');
      }
      return true;
    }),

  body('checkOut')
    .optional()
    .isISO8601()
    .withMessage('Check-out must be a valid date (YYYY-MM-DD)')
    .custom((value, { req }) => {
      if (req.body.checkIn) {
        const checkIn = new Date(req.body.checkIn);
        const checkOut = new Date(value);
        if (checkOut <= checkIn) {
          throw new Error('Check-out must be after check-in date');
        }
      }
      return true;
    }),

  body('guests')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Number of guests must be between 1 and 20'),

  validateRequest
];

/**
 * Validate email/contact form
 * POST /api/ai/sendEmail
 */
const validateEmail = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name contains invalid characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email is too long'),

  body('subject')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subject is too long'),

  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),

  validateRequest
];

/**
 * Validate popular location request
 * POST /api/ai/popularLocation
 */
const validatePopularLocation = [
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters'),

  body('count')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Count must be between 1 and 20')
    .toInt(),

  validateRequest
];

// ============================================
// VALIDATION RULES FOR AUTH ENDPOINTS
// ============================================

/**
 * Validate user registration
 * POST /api/auth/register
 */
const validateRegister = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name contains invalid characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email is too long'),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  body('acceptTerms')
    .custom((value) => value === true || value === 'true')
    .withMessage('Please accept the Terms & Privacy Policy'),

  validateRequest
];

/**
 * Validate user login
 * POST /api/auth/login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  validateRequest
];

/**
 * Validate refresh token request
 * POST /api/auth/refresh
 */
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isString()
    .withMessage('Refresh token must be a string'),

  validateRequest
];

/**
 * Validate password change
 * POST /api/auth/change-password
 */
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),

  validateRequest
];

/**
 * Validate profile update
 * PATCH /api/auth/profile
 */
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Name contains invalid characters'),

  body('tripReminders').optional().isBoolean().toBoolean(),

  validateRequest
];

// ============================================
// VALIDATION RULES FOR DESTINATION ENDPOINTS
// ============================================

const validateDestinationName = [
  param('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Destination must be between 2 and 100 characters')
    .matches(PLACE_PATTERN)
    .withMessage('Destination contains invalid characters'),
  query('count').optional().isInt({ min: 1, max: 20 }).withMessage('count must be 1-20').toInt(),
  query('units').optional().isIn(['metric', 'imperial']).withMessage('units must be metric or imperial'),
  validateRequest
];

const validateDestinationSearch = [
  query('q')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters')
    .matches(PLACE_PATTERN)
    .withMessage('Search query contains invalid characters'),
  query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit must be 1-10').toInt(),
  validateRequest
];

// ============================================
// SANITIZATION HELPERS
// ============================================

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim();
};

/**
 * Middleware to sanitize all req.body fields
 */
// Secrets are compared/hashed, never rendered; altering them would change the
// user's actual password.
const UNSANITIZED_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'refreshToken']);

const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string' && !UNSANITIZED_FIELDS.has(key)) {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    });
  }
  next();
};

module.exports = {
  // Request validation
  validateRequest,

  // AI endpoint validation
  validateAIQuery,
  validateLocationSearch,
  validateEmail,
  validatePopularLocation,

  // Destination endpoint validation
  validateDestinationName,
  validateDestinationSearch,

  // Auth endpoint validation
  validateRegister,
  validateLogin,
  validateRefreshToken,
  validatePasswordChange,
  validateProfileUpdate,

  // Sanitization
  sanitizeBody,
  sanitizeInput
};
