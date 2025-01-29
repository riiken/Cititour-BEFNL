const mongoose = require('mongoose');

const destinationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    discount: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: false
    },
    description: {
        type: String,
        default: ''
    },
    _id:false
});

const locationSchema = new mongoose.Schema({
    location: {
        type: String,
        required: true,
        unique: true
    },
    destinations: [destinationSchema]
});

const LocationSchema = mongoose.model('popularDestinations', locationSchema);
module.exports = LocationSchema;
