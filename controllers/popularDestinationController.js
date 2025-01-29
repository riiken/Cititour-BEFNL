const LocationSchema = require("../model/destinationSchema");
const axios = require('axios');
require('dotenv').config();
const { callOpenAIPrompt } = require("../services/aiService");

const fetchImageFromPexels = async (destinationName) => {
    const apiKey = 'YOUR_PEXELS_API_KEY';  // Replace with your actual Pexels API key
    const url = `https://api.pexels.com/v1/search?query=${destinationName}&per_page=1`;  // Fetching 1 image per location
  
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: apiKey
        }
      });
  
      if (response) {
        return response;  // Return the URL of the first image (medium size)
      }
      return '';  // Return empty string if no image is found
    } catch (error) {
      console.error('Error fetching image for destination:', error);
      return '';  // Return empty string in case of an error
    }
  };

const getPopularLocation = async (req, res) => {
    try {
        const { location } = req.body;

        // Validate input
        if (!location) {
            return res.status(400).json({ error: 'Location is required' });
        }

        const existingLocation = await LocationSchema.findOne({ location });
        if (existingLocation) {
            return res.json({
                source:'db',
                location: location,
                destinations: existingLocation.destinations
            });
        }

        // AI prompt generation for a popular location
        const prompt = `Suggest popular destinations in ${location} with details including name, discount, and description. Store the result in a parsable JSON format in an array of objects like [{name:'', discount:'', description:''}].`;

        const popularDestinations = await callOpenAIPrompt(prompt);
        const destinationsWithImages = [];
        for (const destination of popularDestinations) {
            const image = await fetchImageFromPexels(destination.name);  // Fetch image for the current destination
            destinationsWithImages.push({
                ...destination,
                image: image || ''  // Attach the image (or empty string if no image is found)
            });
        }
        const newLocation = new LocationSchema({
            location,
            destinations: destinationsWithImages
        });
        await newLocation.save();

        return res.json({
            source:'ai',
            location: location,
            destinations: destinationsWithImages
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Something went wrong' });
    }
};

module.exports = {getPopularLocation,fetchImageFromPexels}