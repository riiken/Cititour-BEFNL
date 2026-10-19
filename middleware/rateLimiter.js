const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * Applies to all API routes
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip successful requests from the rate limit count
  skipSuccessfulRequests: false,
  // Skip failed requests from the rate limit count
  skipFailedRequests: false,
});

/**
 * AI endpoint rate limiter (more restrictive)
 * For expensive AI operations
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 AI requests per hour
  message: {
    success: false,
    error: 'Too many AI requests. Free users are limited to 20 requests per hour. Please upgrade to Pro for unlimited access.',
    retryAfter: '1 hour',
    upgrade: '/pricing'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'AI request limit exceeded',
      message: 'You have exceeded the free tier limit of 20 AI requests per hour.',
      limit: 20,
      windowMs: 60 * 60 * 1000,
      retryAfter: res.getHeader('Retry-After'),
      upgrade: {
        message: 'Upgrade to Pro for unlimited AI requests',
        url: '/pricing',
        plans: {
          pro: { price: '$9.99/month', limit: 'unlimited' },
          premium: { price: '$24.99/month', limit: 'unlimited + advanced features' }
        }
      }
    });
  }
});

/**
 * Search/location rate limiter (moderate)
 * For hotel/restaurant searches
 */
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 searches per 15 minutes
  message: {
    success: false,
    error: 'Too many search requests. Please wait a few minutes before searching again.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Email rate limiter (very restrictive)
 * Prevent spam abuse
 */
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit to 5 emails per hour
  message: {
    success: false,
    error: 'Too many emails sent. Please wait an hour before sending another message.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('⚠️  Email rate limit exceeded:', {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      success: false,
      error: 'Email rate limit exceeded',
      message: 'You have sent too many messages. Please wait an hour before trying again.',
      limit: 5,
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Auth endpoint rate limiter (protect login/register)
 * Prevent brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res) => {
    console.warn('⚠️  Auth rate limit exceeded:', {
      ip: req.ip,
      email: req.body?.email,
      endpoint: req.path,
      timestamp: new Date().toISOString()
    });

    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: res.getHeader('Retry-After')
    });
  }
});

/**
 * Strict limiter for sensitive operations
 * For password reset, account deletion, etc.
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 attempts per hour
  message: {
    success: false,
    error: 'Too many attempts for this sensitive operation. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  aiLimiter,
  searchLimiter,
  emailLimiter,
  authLimiter,
  strictLimiter
};
