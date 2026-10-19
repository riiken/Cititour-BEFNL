const mongoose = require('mongoose');

// Snapshot of the place as it was when the plan was made, so a shared trip
// renders the same even after caches refresh.
const placeSnapshot = {
  kind: { type: String, enum: ['attraction', 'hotel', 'restaurant', 'tour', 'area'] },
  name: String,
  description: String,
  lat: Number,
  lon: Number,
  rating: Number,
  reviews: Number,
  priceMin: Number,
  priceText: String,
  price: Number,
  currency: String,
  priceBand: String,
  priceLevel: String,
  cuisines: [String],
  duration: String,
  area: String,
  thumbnail: String,
  url: String,
  // Owner-listed businesses
  partner: Boolean,
  sponsored: Boolean,
  listingId: String,
  photo: String,
  priceUnit: String,
  contact: {
    phone: String,
    whatsapp: String,
    email: String,
    website: String,
    bookingUrl: String
  }
};

const itemSchema = new mongoose.Schema({
  slot: { type: String, enum: ['morning', 'lunch', 'afternoon', 'evening', 'dinner'] },
  note: String,
  place: placeSnapshot
}, { _id: false });

const daySchema = new mongoose.Schema({
  day: Number,
  date: String,
  kind: { type: String, enum: ['arrival', 'full', 'departure'] },
  theme: String,
  items: [itemSchema]
}, { _id: false });

const staySchema = new mongoose.Schema({
  note: String,
  place: placeSnapshot
}, { _id: false });

const itinerarySchema = new mongoose.Schema({
  // Unguessable public id used in share links
  publicId: { type: String, required: true, unique: true },
  // Identical requests reuse a recent plan instead of generating a new one
  cacheKey: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  request: {
    destination: String,
    checkIn: String,
    checkOut: String,
    travellers: Number,
    budget: String,
    interests: [String]
  },
  destination: {
    name: String,
    displayName: String,
    lat: Number,
    lon: Number
  },
  title: String,
  summary: String,
  days: [daySchema],
  stays: [staySchema],
  budget: { total: String, perDay: String, includes: String },
  tips: [String],
  sources: [String],
  guide: { title: String, url: String },
  generatedBy: { method: String, provider: String, promptVersion: String },
  views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Itinerary', itinerarySchema);
