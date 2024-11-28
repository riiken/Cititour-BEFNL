const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const HotelSchema = new mongoose.Schema({
  hotelId: { type: Number, required: true },
  name: { type: String, required: true },
  rating: { type: Number },
  reviewsCount: { type: Number },
  priceMin: { type: Number },
  priceMax: { type: Number },
  amenities: [String],
  categoryTitle: { type: String },
  contacts: {
    streetAddress: { 
        city: { type: String },
        state: { type: String },
        country: { type: String },
        postalCode: { type: String },
        fullAddress: { type: String },
        street1: { type: String },
        street2: { type: String },
     },
    telephone: { type: String },
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  thumbnail: { type: String },
  url: { type: String },
  currency: { type: String },
  typeTitle: { type: String },
  createdAt: { type: Date, default: Date.now },
  _id:false
});

const restaurantSchema = new mongoose.Schema({
    restaurantId: { type: Number, unique: true },
    name: { type: String, required: true },
    contacts: {
      streetAddress: {
        fullAddress: { type: String },
        country: { type: String },
        postalCode: { type: String },
      },
      telephone: { type: String },
    },
    cuisines: { type: [String], default: [] },
    currency: { type: String },
    menu: { type: String },
    openStatus: { type: String },
    openStatusText: { type: String },
    priceTypes: { type: String },
    rating: { type: Number },
    reviewsCount: { type: Number },
    thumbnail: { type: String },
    url: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
  });

const PlaceSchema = new mongoose.Schema({
    place: { type: String, required: true, unique: true }, // Location name (e.g., Bangalore)
    hotels: [HotelSchema], // Array of hotels
    restaurants: [restaurantSchema],
    createdAt: { type: Date, default: Date.now },
  });
  
module.exports = mongoose.model('SuggestedHotel', PlaceSchema);

