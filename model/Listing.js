const mongoose = require('mongoose');

/**
 * A business listed by its owner (stay, restaurant or activity).
 * Only `approved` listings are public or used in trip plans.
 */
const LISTING_TYPES = ['stay', 'restaurant', 'activity'];
const SUBTYPES = {
  stay: ['hotel', 'homestay', 'guest_house', 'hostel', 'resort', 'villa'],
  restaurant: ['restaurant', 'cafe', 'dhaba', 'bar', 'bakery', 'street_food'],
  activity: ['tour', 'trek', 'water_sports', 'adventure', 'workshop', 'guide', 'transport']
};
const STATUSES = ['pending', 'approved', 'rejected', 'paused'];

const listingSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: LISTING_TYPES, required: true },
  subtype: { type: String },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1500 },

  // Location
  city: { type: String, required: true, trim: true, maxlength: 100 },
  cityKey: { type: String, required: true, index: true },
  address: { type: String, trim: true, maxlength: 250 },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lon, lat]
  },

  // Offer
  priceMin: { type: Number, min: 0 },
  priceMax: { type: Number, min: 0 },
  priceUnit: { type: String, enum: ['night', 'person', 'group', 'activity'] },
  amenities: { type: [String], default: [] },   // stays
  cuisines: { type: [String], default: [] },    // restaurants
  vegOnly: { type: Boolean, default: false },
  duration: { type: String, maxlength: 60 },    // activities
  openingHours: { type: String, maxlength: 120 },

  // Contact
  contact: {
    phone: { type: String, maxlength: 20 },
    whatsapp: { type: String, maxlength: 20 },
    email: { type: String, maxlength: 120 },
    website: { type: String, maxlength: 300 },
    bookingUrl: { type: String, maxlength: 500 }
  },

  photoIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

  // Moderation & promotion
  status: { type: String, enum: STATUSES, default: 'pending', index: true },
  rejectionReason: { type: String, maxlength: 300 },
  reviewedAt: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  featured: { type: Boolean, default: false },
  featuredUntil: { type: Date },

  // Stats
  views: { type: Number, default: 0 },
  leads: { type: Number, default: 0 }
}, { timestamps: true });

listingSchema.index({ location: '2dsphere' });
listingSchema.index({ status: 1, cityKey: 1, type: 1 });

listingSchema.methods.isFeaturedNow = function() {
  return Boolean(this.featured && (!this.featuredUntil || this.featuredUntil > new Date()));
};

module.exports = mongoose.model('Listing', listingSchema);
module.exports.LISTING_TYPES = LISTING_TYPES;
module.exports.SUBTYPES = SUBTYPES;
module.exports.STATUSES = STATUSES;
