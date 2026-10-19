const mongoose = require('mongoose');

// A real place near the destination: from Wikivoyage listings or Wikipedia.
const placeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  area: { type: String },
  lat: { type: Number },
  lon: { type: Number },
  price: { type: String },     // price text as listed (hotels)
  priceMin: { type: Number },  // parsed INR amount when available
  url: { type: String },
  source: { type: String, enum: ['wikivoyage', 'wikipedia'] },
  pageId: { type: Number }
}, { _id: false });

const citySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // normalised search text
  name: { type: String },
  displayName: { type: String },
  lat: { type: Number },
  lon: { type: Number },
  bbox: { type: [Number] }, // [south, north, west, east]
  geocodedAt: { type: Date },
  attractions: { type: [placeSchema], default: [] },
  hotels: { type: [placeSchema], default: [] },
  restaurants: { type: [placeSchema], default: [] },
  guide: { title: String, url: String, towns: [String] },
  attractionsFetchedAt: { type: Date },
  placesVersion: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('City', citySchema);
