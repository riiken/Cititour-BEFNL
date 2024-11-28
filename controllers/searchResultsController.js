const axios = require('axios');
const Place = require('../model/Hotel');
require('dotenv').config();

const getTodayAndNext7thDay = () => {
    const today = new Date();
    const next7thDay = new Date(today);
    next7thDay.setDate(today.getDate() + 7);
  
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
  
    return {
      today: formatDate(today),
      next7thDay: formatDate(next7thDay),
    };
  };

  const fetchHotelsFromAPI = async (location, checkIn, checkOut) => {
    try {
      const response = await axios.get(process.env.TRIPADVISOR_API_URL+'/tripadvisor_hotels_search', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
        },
        params: { location, checkIn, checkOut },
      });
  
      const hotels = response?.data?.data || [];
      return hotels?.map((hotel) => ({
        hotelId: hotel?.id,
        name: hotel?.name,
        rating: hotel?.rating,
        reviewsCount: hotel?.reviewsCount,
        priceMin: hotel?.priceMin,
        priceMax: hotel?.priceMax,
        amenities: hotel?.amenities || [],
        categoryTitle: hotel?.categoryTitle,
        contacts: {
          streetAddress: hotel?.contacts?.streetAddress,
          city: hotel?.contacts?.city,
          state: hotel?.contacts?.state,
          country: hotel?.contacts?.country,
          postalCode: hotel?.contacts?.postalCode,
          telephone: hotel?.contacts?.telephone,
        },
        location: {
          latitude: hotel?.latitude,
          longitude: hotel?.longitude,
        },
        thumbnail: hotel?.thumbnail,
        url: hotel?.url,
        currency: hotel?.currency,
        typeTitle: hotel?.typeTitle,
      }));
    } catch (error) {
      console.error('Error fetching hotels from API:', error.message);
      throw new Error('Failed to fetch hotels from API');
    }
  };

  const fetchRestaurantsFromAPI = async (location, sort = 'FEATURED', locale = 'en-US', currency = 'INR') => {
    try {
      const response = await axios.get(process.env.TRIPADVISOR_API_URL  + '/tripadvisor_restaurants_search', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
        },
        params: { location, sort, locale, currency },
      });
  
      const restaurants = response?.data?.data || [];
      return restaurants?.map((restaurant) => ({
        restaurantId: restaurant?.id,
        name: restaurant?.name,
        rating: restaurant?.rating,
        reviewsCount: restaurant?.reviewsCount,
        priceTypes: restaurant?.priceTypes,
        cuisines: restaurant?.cuisines || [],
        contacts: {
          streetAddress:{
          country: restaurant?.contacts?.country,
          fullAddress: restaurant?.contacts?.fullAddress,
          postalCode: restaurant?.contacts?.postalCode,
          },
          telephone: restaurant?.contacts?.telephone,
        },
        location: {
          latitude: restaurant?.latitude,
          longitude: restaurant?.longitude,
        },
        menu: restaurant?.menu,
        thumbnail: restaurant?.thumbnail,
        url: restaurant?.url,
        openStatus: restaurant?.openStatus,
        openStatusText: restaurant?.openStatusText,
        currency: restaurant?.currency,
      }));
    } catch (error) {
      console.error('Error fetching restaurants from API:', error.message);
      throw new Error('Failed to fetch restaurants from API');
    }
  };


const fetchHotels = async (req, res) => {
    const { location, checkIn = getTodayAndNext7thDay()?.today, checkOut = getTodayAndNext7thDay()?.next7thDay, sort = 'BEST_VALUE', locale = 'en-US', currency = 'INR' } = req.body;

  try {

    // Check if data exists in the database
    let placeData = await Place.findOne({ place:location?.toLowerCase() });
    if (placeData) {
        // Check if hotels are missing but restaurants exist
        if ((!placeData.hotels || placeData.hotels.length === 0) && placeData.restaurants && placeData.restaurants.length > 0) {
          const formattedHotels = await fetchHotelsFromAPI(location, checkIn, checkOut);
          placeData.hotels = formattedHotels;
          await placeData.save();
        }
  
        // Check if restaurants are missing but hotels exist
        if ((!placeData.restaurants || placeData.restaurants.length === 0) && placeData.hotels && placeData.hotels.length > 0) {
          const formattedRestaurants = await fetchRestaurantsFromAPI(location);
          console.log("formattedres",formattedRestaurants);
          placeData.restaurants = formattedRestaurants;
          await placeData.save();
        }
  
        return res.json({ source: 'db', data: placeData });
      }

    const formattedHotels = await fetchHotelsFromAPI(location, checkIn, checkOut);
    const formattedRestaurants = await fetchRestaurantsFromAPI(location);

    const newPlace = new Place({ place:location?.toLowerCase(), hotels:formattedHotels,restaurants: formattedRestaurants, });
    await newPlace.save();

    return res.json({ source: 'api', data: newPlace });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { fetchHotels };
