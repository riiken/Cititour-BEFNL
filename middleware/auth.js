const { verifyAccessToken, extractTokenFromRequest } = require('../config/jwt');
const { ApiError } = require('./errorHandler');
const User = require('../model/User');
const logger = require('../config/logger');

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Extract token from request
    const token = extractTokenFromRequest(req);

    if (!token) {
      throw new ApiError(401, 'Authentication required. Please provide a valid token.');
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      if (error.message === 'Access token expired') {
        throw new ApiError(401, 'Access token expired. Please refresh your token.');
      }
      throw new ApiError(401, 'Invalid or malformed token');
    }

    // Check if user exists and is active
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new ApiError(401, 'User not found. Token may be invalid.');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated. Please contact support.');
    }

    // Attach user info to request
    req.user = {
      id: user._id.toString(),
      email: user.email,
      tier: user.tier,
      role: user.isAdmin() ? 'admin' : 'user'
    };

    next();

  } catch (error) {
    // Log authentication failures
    logger.warn('Authentication failed:', {
      error: error.message,
      ip: req.ip,
      url: req.originalUrl
    });

    next(error);
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user to request if token is present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromRequest(req);

    if (!token) {
      // No token provided, continue without authentication
      return next();
    }

    // Try to verify token
    try {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id);

      if (user && user.isActive) {
        req.user = {
          id: user._id.toString(),
          email: user.email,
          tier: user.tier,
          role: user.isAdmin() ? 'admin' : 'user'
        };
      }
    } catch (error) {
      // Token invalid/expired, but we continue without auth
      logger.debug('Optional auth failed (continuing)', { error: error.message });
    }

    next();

  } catch (error) {
    next(error);
  }
};

/**
 * Tier Authorization Middleware
 * Checks if user has required subscription tier
 * @param {Array<String>} allowedTiers - Array of allowed tiers (e.g., ['pro', 'premium'])
 */
const requireTier = (...allowedTiers) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required');
      }

      if (!allowedTiers.includes(req.user.tier)) {
        logger.warn('Insufficient tier access:', {
          userId: req.user.id,
          userTier: req.user.tier,
          requiredTiers: allowedTiers,
          url: req.originalUrl
        });

        throw new ApiError(403, {
          message: `This feature requires ${allowedTiers.join(' or ')} subscription`,
          upgrade: {
            currentTier: req.user.tier,
            requiredTiers: allowedTiers,
            upgradeUrl: '/pricing'
          }
        });
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

/**
 * Usage Tracking Middleware
 * Tracks user API usage and enforces tier limits
 * @param {String} requestType - Type of request ('ai', 'search', 'email')
 */
const trackUsage = (requestType = 'ai') => {
  return async (req, res, next) => {
    try {
      // If user is authenticated, track usage
      if (req.user && req.user.id) {
        const user = await User.findById(req.user.id);

        if (!user) {
          throw new ApiError(404, 'User not found');
        }

        // Check if user has exceeded rate limit
        const rateLimit = user.checkRateLimit(requestType);

        if (!rateLimit.allowed) {
          logger.warn('User exceeded rate limit:', {
            userId: user._id,
            email: user.email,
            requestType,
            tier: user.tier,
            limit: rateLimit.limit,
            current: rateLimit.current
          });

          throw new ApiError(429, {
            message: `You have exceeded your ${user.tier} tier limit for ${requestType} requests`,
            rateLimit: {
              limit: rateLimit.limit,
              current: rateLimit.current,
              remaining: rateLimit.remaining
            },
            upgrade: {
              message: 'Upgrade to Pro for higher limits',
              upgradeUrl: '/pricing'
            }
          });
        }

        // Increment usage counter
        await user.incrementUsage(requestType);

        // Attach updated usage info to request
        req.userUsage = {
          limit: rateLimit.limit,
          remaining: Math.max(0, rateLimit.remaining - 1), // Account for current request
          tier: user.tier
        };

        logger.info('Usage tracked:', {
          userId: user._id,
          requestType,
          remaining: req.userUsage.remaining
        });
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

/**
 * Email Verification Required Middleware
 * Checks if user's email is verified
 */
const requireEmailVerification = (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }

    // For now, we'll skip this check
    // In production, you'd check user.isEmailVerified
    // if (!user.isEmailVerified) {
    //   throw new ApiError(403, 'Email verification required');
    // }

    next();

  } catch (error) {
    next(error);
  }
};

/**
 * Admin Only Middleware (use after authenticate)
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  if (req.user.role !== 'admin') {
    logger.warn('Admin access denied', { userId: req.user.id, url: req.originalUrl });
    return next(new ApiError(403, 'Admin access required'));
  }
  return next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireTier,
  trackUsage,
  requireEmailVerification,
  requireAdmin
};
