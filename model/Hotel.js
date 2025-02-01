const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const HotelSchema = new mongoose.Schema({
  hotelId: { type: Number, required: true },
  name: { type: String, required: true },
  rating: { type: mongoose.Schema.Types.Mixed },
  reviewsCount: { type: Number },
  priceMin: { type: Number },
  priceMax: { type: Number },
  amenities: [String],
  categoryTitle: { type: String },
  contacts: {type:Object},
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  ranking:{type:Object},
  thumbnail: { type: String },
  url: { type: String },
  styles:{type:Object},
  photos:[String],
  currency: { type: String },
  typeTitle: { type: String },
  createdAt: { type: Date, default: Date.now },
  _id:false
});

const restaurantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: {type:Object},
    phone:{type:String},
    photos:[String],
    cuisines: { type: [String], default: [] },
    currency: { type: String },
    link:{type:String},
    menu: { type: String },
    openStatus: { type: String },
    openStatusText: { type: String },
    priceTypes: { type: String },
    rating: { type: Number },
    reviewsCount: { type: Number },
    thumbnail: { type: String },
    id:{type:String}
  });

  const TourSchema = new mongoose.Schema({
    id: { type: String},
    image:{type:String},
    photos:[String],
    title: { type: String, required: true },
    description: { type: String },
    category: { type: String },
    duration: { type: String },
    cancellation: { type: String },
    languages: { type: [String] },
    operator: { type: String },
    price: { type: String },
    rating: { type: Number },
    reviewsCount: { type: String },
    url: { type: String },
    currency: { type: String },
    createdAt: { type: Date, default: Date.now },
  });

  const VacationRentalSchema = new mongoose.Schema({
    rentalId: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String },
    amenities: { type: [String], default: [] },
    pricePerNight: {
      amount: { type: Number },
      amountUSD: { type: Number },
      currency: { type: String },
    },
    bathCount: { type: Number },
    roomCount: { type: Number },
    sleepCount: { type: Number },
    rating: { type: Number },
    reviewsCount: { type: Number },
    photos: { type: [String], default: [] },
    latitude: { type: Number },
    longitude: { type: Number },
    logo: { type: String },
    url: { type: String },
    currency: { type: String },
    createdAt: { type: Date, default: Date.now },
  });

const PlaceSchema = new mongoose.Schema({
    place: { type: String, required: true, unique: true }, // Location name (e.g., Bangalore)
    hotels: [HotelSchema], // Array of hotels
    restaurants: [restaurantSchema],
    tours: [TourSchema],
    // vacationRentals: [VacationRentalSchema],
    createdAt: { type: Date, default: Date.now },
  });
  
module.exports = mongoose.model('SuggestedHotel', PlaceSchema);

