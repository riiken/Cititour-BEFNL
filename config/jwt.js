const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

/**
 * JWT Configuration and Utilities
 *
 * Access Tokens: Short-lived (15 minutes)
 * Refresh Tokens: Long-lived (7 days)
 */

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate access token (15 minutes)
 * @param {Object} payload - User data to encode
 * @returns {String} JWT access token
 */
const generateAccessToken = (payload) => {
  try {
    const { id, email, tier } = payload;

    return jwt.sign(
      {
        id,
        email,
        tier,
        type: 'access'
      },
      process.env.JWT_SECRET,
      {
        jwtid: crypto.randomUUID(), // unique even when issued in the same second
        expiresIn: '15m', // 15 minutes
        issuer: 'cititour-api',
        audience: 'cititour-client'
      }
    );
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Failed to generate access token');
  }
};

/**
 * Generate refresh token (7 days)
 * @param {Object} payload - User data to encode
 * @returns {String} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  try {
    const { id, email } = payload;

    return jwt.sign(
      {
        id,
        email,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET,
      {
        jwtid: crypto.randomUUID(), // unique per token, so rotation/reuse detection is exact
        expiresIn: '7d', // 7 days
        issuer: 'cititour-api',
        audience: 'cititour-client'
      }
    );
  } catch (error) {
    logger.error('Error generating refresh token:', error);
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (user) => {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    tier: user.tier
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
};

// ============================================
// TOKEN VERIFICATION
// ============================================

/**
 * Verify access token
 * @param {String} token - JWT access token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'cititour-api',
      audience: 'cititour-client'
    });

    // Verify token type
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Access token expired');
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid access token');
      throw new Error('Invalid access token');
    } else {
      logger.error('Token verification error:', error);
      throw new Error('Token verification failed');
    }
  }
};

/**
 * Verify refresh token
 * @param {String} token - JWT refresh token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: 'cititour-api',
      audience: 'cititour-client'
    });

    // Verify token type
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Refresh token expired');
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid refresh token');
      throw new Error('Invalid refresh token');
    } else {
      logger.error('Token verification error:', error);
      throw new Error('Token verification failed');
    }
  }
};

// ============================================
// TOKEN EXTRACTION
// ============================================

/**
 * Extract token from Authorization header
 * @param {String} authHeader - Authorization header value
 * @returns {String|null} Extracted token or null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Extract token from request object
 * @param {Object} req - Express request object
 * @returns {String|null} Extracted token or null
 */
const extractTokenFromRequest = (req) => {
  // Try Authorization header first
  let token = extractTokenFromHeader(req.headers.authorization);

  if (token) return token;

  // Try cookie as fallback
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
};

// ============================================
// TOKEN DECODING (WITHOUT VERIFICATION)
// ============================================

/**
 * Decode token without verifying (useful for expired tokens)
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error('Token decode error:', error);
    return null;
  }
};

/**
 * Get token expiration date
 * @param {String} token - JWT token
 * @returns {Date|null} Expiration date or null
 */
const getTokenExpiration = (token) => {
  const decoded = decodeToken(token);

  if (!decoded || !decoded.exp) {
    return null;
  }

  return new Date(decoded.exp * 1000);
};

/**
 * Check if token is expired
 * @param {String} token - JWT token
 * @returns {Boolean}
 */
const isTokenExpired = (token) => {
  const expiration = getTokenExpiration(token);

  if (!expiration) {
    return true;
  }

  return new Date() > expiration;
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Generation
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,

  // Verification
  verifyAccessToken,
  verifyRefreshToken,

  // Extraction
  extractTokenFromHeader,
  extractTokenFromRequest,

  // Decoding
  decodeToken,
  getTokenExpiration,
  isTokenExpired
};
