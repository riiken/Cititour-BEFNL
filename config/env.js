/**
 * Environment validation.
 * Loaded once from server.js after dotenv. Fails fast in production when
 * required configuration is missing; warns in development.
 */

const REQUIRED = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

// Optional integrations: the feature degrades gracefully when absent.
const OPTIONAL = {
  GEMINI_API_KEY: 'Gemini AI (primary LLM)',
  GROQ_API_KEY: 'Groq AI (fallback LLM)',
  RAPIDAPI_KEY: 'Hotels/restaurants/tours search',
  TRIPADVISOR_API_URL: 'Hotels/restaurants/tours search',
  OPENWEATHER_API_KEY: 'Weather',
  UNSPLASH_API_KEY: 'Destination photos',
  EMAIL_USER: 'Contact form email',
  EMAIL_PASS: 'Contact form email',
  BOOKING_AFFILIATE_ID: 'Booking.com affiliate links (revenue)'
};

const PLACEHOLDER = /^your_|_here$|TODO/i;

const isSet = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() !== '' && !PLACEHOLDER.test(value);
};

const validateEnv = (logger = console) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing = REQUIRED.filter((key) => !isSet(key));

  if (missing.length) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (isProduction) {
      throw new Error(message);
    }
    logger.warn(message);
  }

  if (isProduction) {
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      if (isSet(key) && process.env[key].length < 32) {
        throw new Error(`${key} must be at least 32 characters in production`);
      }
    }
  }

  const disabled = Object.entries(OPTIONAL)
    .filter(([key]) => !isSet(key))
    .map(([key, feature]) => `${key} (${feature})`);

  if (disabled.length) {
    logger.warn(`Optional integrations not configured: ${disabled.join('; ')}`);
  }

  return { missing, disabled };
};

module.exports = { validateEnv, isSet };
