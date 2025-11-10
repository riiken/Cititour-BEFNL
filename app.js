const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const aiRoutes = require('./routes/aiRoutes');
const authRoutes = require('./routes/authRoutes');
const { apiLimiter } = require('./middleware/rateLimiter');
const { sanitizeBody } = require('./middleware/validation');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

require('dotenv').config();

const app = express();

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Security: Helmet middleware for security headers
app.use(helmet());

// CORS Configuration - Properly restrict origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_PROD,
  'http://localhost:4200',
  'http://localhost:4000', // For SSR server
  'https://cititour.onrender.com'
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('⚠️  CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ============================================
// LOGGING MIDDLEWARE
// ============================================

// HTTP request logging with Morgan + Winston
app.use(morgan('combined', { stream: logger.stream }));

// ============================================
// BODY PARSING MIDDLEWARE
// ============================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize all request bodies to prevent XSS
app.use(sanitizeBody);

// ============================================
// DATABASE CONNECTION
// ============================================

connectDB();

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// ============================================
// API ROUTES WITH RATE LIMITING
// ============================================

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Auth Routes (must be before AI routes for proper ordering)
app.use('/api/auth', authRoutes);

// AI Routes
app.use('/api/ai', aiRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// Handle 404 - Route not found (MUST be after all routes)
app.use(notFoundHandler);

// Global error handler (MUST be last)
app.use(errorHandler);

// ============================================
// STARTUP LOG
// ============================================

logger.info('✅ CitiTour Backend initialized successfully', {
  environment: process.env.NODE_ENV,
  corsOrigins: allowedOrigins.length,
  timestamp: new Date().toISOString()
});

module.exports = app;
