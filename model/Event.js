const mongoose = require('mongoose');

// First-party product events (no personal data): outbound partner clicks,
// shares and plan views. Used to measure what earns money.
const eventSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['outbound_click', 'share', 'plan_view', 'lead'] },
  partner: { type: String },     // booking | getyourguide | maps | whatsapp | call | website | copy
  placement: { type: String },   // e.g. itinerary_stay, itinerary_item, search_hotel
  itineraryId: { type: String },
  listingId: { type: mongoose.Schema.Types.ObjectId, index: true },
  destination: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

eventSchema.index({ type: 1, createdAt: -1 });
eventSchema.index({ partner: 1, createdAt: -1 });

module.exports = mongoose.model('Event', eventSchema);
