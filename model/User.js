const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please provide a valid email address'
    ]
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't return password in queries by default
  },

  // Access role. Admins can also be granted via the ADMIN_EMAILS env var.
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },

  // Subscription & Usage Tracking
  tier: {
    type: String,
    enum: ['free', 'pro', 'premium'],
    default: 'free'
  },

  // Usage Statistics
  usage: {
    // AI Request Tracking
    aiRequestCount: {
      type: Number,
      default: 0
    },
    lastAiRequestDate: {
      type: Date,
      default: null
    },
    aiRequestsThisHour: {
      type: Number,
      default: 0
    },
    hourlyResetTime: {
      type: Date,
      default: null
    },

    // Search Request Tracking
    searchRequestCount: {
      type: Number,
      default: 0
    },
    lastSearchRequestDate: {
      type: Date,
      default: null
    },
    searchRequestsToday: {
      type: Number,
      default: 0
    },
    searchDayStart: {
      type: Date,
      default: null
    },

    // Email Request Tracking
    emailRequestCount: {
      type: Number,
      default: 0
    },
    lastEmailRequestDate: {
      type: Date,
      default: null
    },
    emailRequestsToday: {
      type: Number,
      default: 0
    },
    emailDayStart: {
      type: Date,
      default: null
    }
  },

  // Subscription Details
  subscription: {
    startDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    },
    stripeCustomerId: {
      type: String,
      default: null
    },
    stripeSubscriptionId: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired', 'trial'],
      default: null
    }
  },

  // Authentication
  // SHA-256 hash of the current refresh token (never the token itself)
  refreshToken: {
    type: String,
    select: false // Don't return refresh token in queries
  },

  // Password Reset
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },

  // Email Verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },

  // Consent record
  termsAcceptedAt: {
    type: Date,
    default: null
  },
  termsVersion: {
    type: String,
    default: null
  },

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  }

}, {
  timestamps: true // Adds createdAt and updatedAt
});

// ============================================
// INDEXES FOR PERFORMANCE
// ============================================

userSchema.index({ tier: 1 });
userSchema.index({ refreshToken: 1 }, { sparse: true });
userSchema.index({ 'subscription.status': 1 });

// ============================================
// PRE-SAVE MIDDLEWARE - Hash Password
// ============================================

userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Compare provided password with hashed password
 * @param {String} candidatePassword - Password to check
 * @returns {Promise<Boolean>}
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

/**
 * Per-tier limits. AI is per rolling hour; search and email per UTC day.
 * Paid tiers have high but finite AI limits: every AI request has a real cost.
 */
const TIER_LIMITS = {
  free: { ai: 20, search: 100, email: 5 },
  pro: { ai: 100, search: Infinity, email: 50 },
  premium: { ai: 300, search: Infinity, email: Infinity }
};

const HOUR_MS = 60 * 60 * 1000;

const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Reset expired usage windows (mutates the document; persisted by incrementUsage).
 */
userSchema.methods.resetExpiredUsageWindows = function(now = new Date()) {
  const usage = this.usage;
  if (!usage.hourlyResetTime || now - usage.hourlyResetTime >= HOUR_MS) {
    usage.aiRequestsThisHour = 0;
    usage.hourlyResetTime = now;
  }
  const today = startOfUtcDay(now);
  if (!usage.searchDayStart || usage.searchDayStart < today) {
    usage.searchRequestsToday = 0;
    usage.searchDayStart = today;
  }
  if (!usage.emailDayStart || usage.emailDayStart < today) {
    usage.emailRequestsToday = 0;
    usage.emailDayStart = today;
  }
};

/**
 * Check if user has exceeded their tier limits
 * @param {String} requestType - Type of request ('ai', 'search', 'email')
 * @returns {Object} { allowed, limit, current, remaining, window }
 */
userSchema.methods.checkRateLimit = function(requestType = 'ai') {
  this.resetExpiredUsageWindows();

  const limits = TIER_LIMITS[this.tier] || TIER_LIMITS.free;
  const limit = limits[requestType];
  const current = {
    ai: this.usage.aiRequestsThisHour,
    search: this.usage.searchRequestsToday,
    email: this.usage.emailRequestsToday
  }[requestType] || 0;

  return {
    allowed: current < limit,
    limit: limit === Infinity ? 'unlimited' : limit,
    current,
    remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - current),
    window: requestType === 'ai' ? 'hour' : 'day'
  };
};

/**
 * Increment usage counter for a request type
 * @param {String} requestType - Type of request ('ai', 'search', 'email')
 */
userSchema.methods.incrementUsage = async function(requestType = 'ai') {
  const now = new Date();
  this.resetExpiredUsageWindows(now);

  if (requestType === 'ai') {
    this.usage.aiRequestCount += 1;
    this.usage.aiRequestsThisHour += 1;
    this.usage.lastAiRequestDate = now;
  } else if (requestType === 'search') {
    this.usage.searchRequestCount += 1;
    this.usage.searchRequestsToday += 1;
    this.usage.lastSearchRequestDate = now;
  } else if (requestType === 'email') {
    this.usage.emailRequestCount += 1;
    this.usage.emailRequestsToday += 1;
    this.usage.lastEmailRequestDate = now;
  }

  await this.save();
};

/**
 * Get user profile (without sensitive data)
 * @returns {Object}
 */
/**
 * Whether this user has admin access (stored role or ADMIN_EMAILS allow-list).
 */
userSchema.methods.isAdmin = function() {
  if (this.role === 'admin') return true;
  const admins = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(String(this.email).toLowerCase());
};

userSchema.methods.toProfileJSON = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    tier: this.tier,
    role: this.isAdmin() ? 'admin' : 'user',
    isEmailVerified: this.isEmailVerified,
    usage: {
      aiRequests: this.usage.aiRequestCount,
      searchRequests: this.usage.searchRequestCount,
      emailRequests: this.usage.emailRequestCount
    },
    subscription: {
      status: this.subscription.status,
      endDate: this.subscription.endDate
    },
    createdAt: this.createdAt,
    lastLogin: this.lastLogin
  };
};

/**
 * Check if subscription is active
 * @returns {Boolean}
 */
userSchema.methods.hasActiveSubscription = function() {
  if (this.tier === 'free') return true;

  return (
    this.subscription.status === 'active' &&
    this.subscription.endDate &&
    new Date(this.subscription.endDate) > new Date()
  );
};

// ============================================
// STATIC METHODS
// ============================================

/**
 * Find user by email (including password for authentication)
 * @param {String} email
 * @returns {Promise<User>}
 */
userSchema.statics.findByCredentials = async function(email) {
  return await this.findOne({ email }).select('+password +refreshToken');
};

/**
 * Find user by refresh token
 * @param {String} refreshToken
 * @returns {Promise<User>}
 */
userSchema.statics.hashToken = function(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

userSchema.statics.findByRefreshToken = async function(refreshToken) {
  // Tokens issued before hashing was introduced were stored as-is; accept
  // those until they expire (max 7 days), after which only hashes remain.
  return await this.findOne({
    refreshToken: { $in: [this.hashToken(refreshToken), refreshToken] }
  }).select('+refreshToken');
};

module.exports = mongoose.model('User', userSchema);
module.exports.TIER_LIMITS = TIER_LIMITS;
