const mongoose = require('mongoose');

const aiResponseSchema = new mongoose.Schema({
  query: { type: String, required: true, unique: true },
  budget: { type: String, default: 'Not available' },
  travelGuide: {type:[{
    placeName: String,
    imageURLFromGoogle: String,
    websiteLink: String,
    explanation: String,
    location: String,
  }],_id:false},
  stayGuide: {type:[{
    hotelName: String,
    address: String,
    rating: Number,
    websiteLink: String
  }],_id:false},
  foodGuide: {type:[{
    restaurantName: String,
    cuisineType: String,
    rating: Number,
    websiteLink: String
  }],_id:false}
}, { timestamps: true });

aiResponseSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id; // Optionally rename _id to id
    delete ret._id;   // Remove _id from the response
    return ret;
  }
});

const AiResponse = mongoose.model('tourRecommendation', aiResponseSchema);

module.exports = AiResponse;
