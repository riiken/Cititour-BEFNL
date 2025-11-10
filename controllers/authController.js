const User = require('../model/User');
const { generateTokenPair, verifyRefreshToken } = require('../config/jwt');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      throw new ApiError(400, 'Email already registered');
    }

    // Create new user (password will be hashed by pre-save hook)
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      tier: 'free',
      isActive: true
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user);

    // Save refresh token to user
    user.refreshToken = refreshToken;
    await user.save();

    logger.info('New user registered:', {
      userId: user._id,
      email: user.email,
      tier: user.tier
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toProfileJSON(),
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email (including password field)
    const user = await User.findByCredentials(email.toLowerCase());

    if (!user) {
      throw new ApiError(401, 'Invalid email or password');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      logger.warn('Failed login attempt:', {
        email: email,
        ip: req.ip
      });
      throw new ApiError(401, 'Invalid email or password');
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokenPair(user);

    // Update refresh token in database
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    logger.info('User logged in:', {
      userId: user._id,
      email: user.email,
      ip: req.ip
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toProfileJSON(),
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Logout user (invalidate refresh token)
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    // req.user is set by auth middleware
    const userId = req.user.id;

    // Remove refresh token from database
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshToken: 1 }
    });

    logger.info('User logged out:', {
      userId: userId,
      email: req.user.email
    });

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token using refresh token
 * POST /api/auth/refresh
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError(400, 'Refresh token is required');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new ApiError(401, error.message);
    }

    // Find user by refresh token
    const user = await User.findByRefreshToken(refreshToken);

    if (!user || user._id.toString() !== decoded.id) {
      logger.warn('Invalid refresh token attempt:', {
        decodedId: decoded.id,
        ip: req.ip
      });
      throw new ApiError(401, 'Invalid refresh token');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ApiError(403, 'Account is deactivated');
    }

    // Generate new token pair
    const tokens = generateTokenPair(user);

    // Update refresh token in database
    user.refreshToken = tokens.refreshToken;
    await user.save();

    logger.info('Tokens refreshed:', {
      userId: user._id,
      email: user.email
    });

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getProfile = async (req, res, next) => {
  try {
    // req.user is set by auth middleware
    const user = await User.findById(req.user.id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toProfileJSON()
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 * PATCH /api/auth/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    // Only allow updating certain fields
    const allowedUpdates = {};
    if (name) allowedUpdates.name = name.trim();

    // Prevent empty updates
    if (Object.keys(allowedUpdates).length === 0) {
      throw new ApiError(400, 'No valid fields to update');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    logger.info('User profile updated:', {
      userId: user._id,
      updates: Object.keys(allowedUpdates)
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toProfileJSON()
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Change password
 * POST /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    // Invalidate all refresh tokens (force re-login on all devices)
    user.refreshToken = undefined;
    await user.save();

    logger.info('Password changed:', {
      userId: user._id,
      email: user.email
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get user usage statistics
 * GET /api/auth/usage
 */
const getUsage = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Check current rate limits
    const aiLimit = user.checkRateLimit('ai');
    const searchLimit = user.checkRateLimit('search');
    const emailLimit = user.checkRateLimit('email');

    res.status(200).json({
      success: true,
      data: {
        tier: user.tier,
        usage: {
          ai: {
            total: user.usage.aiRequestCount,
            thisHour: user.usage.aiRequestsThisHour,
            limit: aiLimit.limit,
            remaining: aiLimit.remaining,
            lastRequest: user.usage.lastAiRequestDate
          },
          search: {
            total: user.usage.searchRequestCount,
            limit: searchLimit.limit,
            remaining: searchLimit.remaining,
            lastRequest: user.usage.lastSearchRequestDate
          },
          email: {
            total: user.usage.emailRequestCount,
            limit: emailLimit.limit,
            remaining: emailLimit.remaining,
            lastRequest: user.usage.lastEmailRequestDate
          }
        },
        subscription: {
          status: user.subscription.status,
          startDate: user.subscription.startDate,
          endDate: user.subscription.endDate
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  refresh,
  getProfile,
  updateProfile,
  changePassword,
  getUsage
};
