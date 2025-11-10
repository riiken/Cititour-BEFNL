const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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

    // Email Request Tracking
    emailRequestCount: {
      type: Number,
      default: 0
    },
    lastEmailRequestDate: {
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

userSchema.index({ email: 1 });
userSchema.index({ tier: 1 });
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
 * Check if user has exceeded their tier limits
 * @param {String} requestType - Type of request ('ai', 'search', 'email')
 * @returns {Object} { allowed: Boolean, limit: Number, current: Number }
 */
userSchema.methods.checkRateLimit = function(requestType = 'ai') {
  const limits = {
    free: {
      ai: 20,
      search: 50,
      email: 5
    },
    pro: {
      ai: Infinity,
      search: Infinity,
      email: 50
    },
    premium: {
      ai: Infinity,
      search: Infinity,
      email: Infinity
    }
  };

  const limit = limits[this.tier][requestType];
  let current = 0;

  // Check if we need to reset hourly counter
  const now = new Date();
  if (requestType === 'ai') {
    if (!this.usage.hourlyResetTime || now - this.usage.hourlyResetTime > 3600000) {
      // Reset hourly counter
      this.usage.aiRequestsThisHour = 0;
      this.usage.hourlyResetTime = now;
    }
    current = this.usage.aiRequestsThisHour;
  } else if (requestType === 'search') {
    current = this.usage.searchRequestCount;
  } else if (requestType === 'email') {
    current = this.usage.emailRequestCount;
  }

  return {
    allowed: current < limit,
    limit: limit === Infinity ? 'unlimited' : limit,
    current,
    remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - current)
  };
};

/**
 * Increment usage counter for a request type
 * @param {String} requestType - Type of request ('ai', 'search', 'email')
 */
userSchema.methods.incrementUsage = async function(requestType = 'ai') {
  const now = new Date();

  if (requestType === 'ai') {
    this.usage.aiRequestCount += 1;
    this.usage.aiRequestsThisHour += 1;
    this.usage.lastAiRequestDate = now;
  } else if (requestType === 'search') {
    this.usage.searchRequestCount += 1;
    this.usage.lastSearchRequestDate = now;
  } else if (requestType === 'email') {
    this.usage.emailRequestCount += 1;
    this.usage.lastEmailRequestDate = now;
  }

  await this.save();
};

/**
 * Get user profile (without sensitive data)
 * @returns {Object}
 */
userSchema.methods.toProfileJSON = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    tier: this.tier,
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
userSchema.statics.findByRefreshToken = async function(refreshToken) {
  return await this.findOne({ refreshToken }).select('+refreshToken');
};

module.exports = mongoose.model('User', userSchema);
