const logger = require('../config/logger');

/**
 * Custom Error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Convert non-ApiError errors to ApiError
 */
const convertToApiError = (err) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let isOperational = err.isOperational || false;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
    isOperational = true;
  } else if (err.name === 'CastError') {
    // Mongoose bad ObjectId
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    isOperational = true;
  } else if (err.code === 11000) {
    // Mongoose duplicate key error
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate field value: ${field}. Please use another value.`;
    isOperational = true;
  } else if (err.name === 'JsonWebTokenError') {
    // JWT invalid token
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
    isOperational = true;
  } else if (err.name === 'TokenExpiredError') {
    // JWT expired token
    statusCode = 401;
    message = 'Your token has expired. Please log in again.';
    isOperational = true;
  }

  return new ApiError(statusCode, message, isOperational, err.stack);
};

/**
 * Error handling middleware
 * MUST be the last middleware in the chain
 */
const errorHandler = (err, req, res, next) => {
  // Convert error to ApiError if it isn't already
  let error = err;
  if (!(error instanceof ApiError)) {
    error = convertToApiError(err);
  }

  const { statusCode, message, isOperational } = error;

  // Log error
  const logData = {
    statusCode,
    message: error.message,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', {
      ...logData,
      stack: error.stack
    });
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', logData);
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && !isOperational) {
    res.status(statusCode).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      statusCode,
      ...(process.env.NODE_ENV === 'development' && {
        error: message,
        stack: error.stack
      })
    });
  } else {
    res.status(statusCode).json({
      success: false,
      message,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
};

/**
 * Handle 404 - Route not found
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route not found: ${req.originalUrl}`);
  next(error);
};

/**
 * Async error wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => {...}))
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
