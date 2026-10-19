const mongoose = require('mongoose');

// Small, client-resized photos stored in MongoDB (max ~400 KB each).
const listingPhotoSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  data: { type: Buffer, required: true },
  size: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('ListingPhoto', listingPhotoSchema);
