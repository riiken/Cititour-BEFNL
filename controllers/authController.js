const User = require('../model/User');
const { generateTokenPair, verifyRefreshToken } = require('../config/jwt');
const { ApiError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const logger = require('../config/logger');
const { sendMailSafe, appUrl } = require('../config/mailer');

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
      isActive: true,
      termsAcceptedAt: new Date(),
      termsVersion: process.env.TERMS_VERSION || '2026-10-18'
    });

    // Generate tokens (the id is assigned on construction) and save once
    const { accessToken, refreshToken } = generateTokenPair(user);
    user.refreshToken = User.hashToken(refreshToken);
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
    user.refreshToken = User.hashToken(refreshToken);
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
    // Works with a valid access token, or with just the refresh token (so an
    // expired session can still be revoked)
    let userId = req.user && req.user.id;
    if (!userId && typeof req.body.refreshToken === 'string') {
      const user = await User.findByRefreshToken(req.body.refreshToken);
      userId = user && user._id;
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
      logger.info('User logged out', { userId: String(userId) });
    }

    res.status(200).json({ success: true, message: 'Logout successful' });
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
    user.refreshToken = User.hashToken(tokens.refreshToken);
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
    const { name, tripReminders } = req.body;

    // Only allow updating certain fields
    const allowedUpdates = {};
    if (name) allowedUpdates.name = name.trim();
    if (typeof tripReminders === 'boolean') allowedUpdates['notifications.tripReminders'] = tripReminders;

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

    // Update password (hashed by pre-save hook) and invalidate the refresh
    // token, forcing re-login on all devices
    user.password = newPassword;
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
            today: user.usage.searchRequestsToday,
            window: searchLimit.window,
            limit: searchLimit.limit,
            remaining: searchLimit.remaining,
            lastRequest: user.usage.lastSearchRequestDate
          },
          email: {
            total: user.usage.emailRequestCount,
            today: user.usage.emailRequestsToday,
            window: emailLimit.window,
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

// ---------------------------------------------------------------- password reset

const RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_RESET_MESSAGE = 'If an account exists for that email, we have sent a link to reset the password. It expires in 30 minutes.';

/**
 * Email a single-use reset link. Always responds the same way so the
 * endpoint can't be used to discover which emails are registered.
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email).toLowerCase().trim();
    const user = await User.findOne({ email, isActive: true });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = User.hashToken(token);
      user.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
      await user.save();

      const link = `${appUrl()}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      sendMailSafe({
        to: user.email,
        subject: 'Reset your CitiTour password',
        text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password won't change.\n\nTeam CitiTour`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#86B817">CitiTour</h2>
          <p>Hi ${String(user.name).replace(/[<>&"]/g, '')},</p>
          <p>Use the button below to set a new password. The link is valid for 30 minutes and works once.</p>
          <p><a href="${link}" style="background:#86B817;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Set a new password</a></p>
          <p style="color:#868e96;font-size:13px">If you didn't ask for this, ignore this email. Your password won't change.</p></div>`
      });
      logger.info('Password reset requested', { userId: String(user._id) });
    }

    res.status(200).json({ success: true, message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    next(error);
  }
};

/**
 * Set a new password with a valid reset token. Signs the user out everywhere.
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email).toLowerCase().trim();
    const user = await User.findOne({
      email,
      passwordResetToken: User.hashToken(req.body.token),
      passwordResetExpires: { $gt: new Date() }
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.');
    }

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken = undefined; // sign out other sessions
    await user.save();

    logger.info('Password reset completed', { userId: String(user._id) });
    res.status(200).json({ success: true, message: 'Your password has been changed. Please log in.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
  register,
  login,
  logout,
  refresh,
  getProfile,
  updateProfile,
  changePassword,
  getUsage
};
