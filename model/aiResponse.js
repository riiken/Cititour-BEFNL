const mongoose = require('mongoose');

// Field names match the AI output contract in services/aiService.js.
// Links are not stored; they are attached when a guide is served.
const placeSchema = new mongoose.Schema({
  placeName: String,
  explanation: String,
  location: String
}, { _id: false });

const pricedPlaceSchema = new mongoose.Schema({
  placeName: String,
  explanation: String,
  location: String,
  cost: String
}, { _id: false });

const aiResponseSchema = new mongoose.Schema({
  // Cache key (prompt version + normalised trip). Kept in the legacy `query`
  // field, whose unique index already exists in deployed databases. Documents
  // written by older versions use the raw query string and are never matched.
  query: { type: String, required: true, unique: true },
  originalQuery: { type: String },
  promptVersion: { type: String },
  destination: { type: String },
  budget: { type: String, default: 'Not available' },
  travelGuide: { type: [placeSchema], default: [] },
  stayGuide: { type: [pricedPlaceSchema], default: [] },
  foodGuide: { type: [pricedPlaceSchema], default: [] }
}, { timestamps: true });

aiResponseSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const AiResponse = mongoose.model('tourRecommendation', aiResponseSchema);

module.exports = AiResponse;
