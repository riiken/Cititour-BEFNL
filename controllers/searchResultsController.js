const axios = require('axios');
const Place = require('../model/Hotel');
const { v4: uuidv4 } = require('uuid');
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
      const response = await axios.get(process.env.TRIPADVISOR_API_URL+'/tripadvisor_hotels_search_v2', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
        },
        params: { location, checkIn, checkOut },
      });
  
      const hotels = response?.data?.data || [];
      return hotels?.map((hotel) => ({
        hotelId: hotel?.id || uuidv4(),
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
      const response = await axios.get(process.env.TRIPADVISOR_API_URL  + '/tripadvisor_restaurants_search_v2', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
        },
        params: { location, sort, locale, currency },
      });
  
      const restaurants = response?.data?.data || [];
      return restaurants?.map((restaurant) => ({
        restaurantId: restaurant?.id || uuidv4(),
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

  const fetchToursFromAPI = async (location, checkIn, checkOut) => {
    try {
      const response = await axios.get(process.env.TRIPADVISOR_API_URL + '/tripadvisor_tours_search_v2', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
        },
        params: { location, checkIn, checkOut },
      });
  
      const tours = response?.data?.data || [];
      return tours.map((tour) => ({
        tourId: tour?.id || uuidv4(),
        title: tour?.title,
        description: tour?.description,
        category: tour?.category,
        duration: tour?.duration,
        cancellation: tour?.cancellation,
        languages: tour?.languages || [],
        operator: tour?.operator,
        price: tour?.price?.total,
        priceText: tour?.priceText,
        rating: tour?.rating,
        reviewsCount: tour?.reviewsCount,
        thumbnail: tour?.thumbnail,
        url: tour?.url,
        currency: tour?.price?.currency,
      }));
    } catch (error) {
      console.error('Error fetching tours from API:', error.message);
      throw new Error('Failed to fetch tours from API');
    }
  };

  // const fetchVacationRentsFromAPI = async (location, checkIn, checkOut) => {
  //   try {
  //     const response = await axios.get(process.env.TRIPADVISOR_API_URL + '/tripadvisor_vacation_rent_search', {
  //       headers: {
  //         'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
  //         'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com',
  //       },
  //       params: { location, checkIn, checkOut },
  //     });
  //     console.log("vacationrentals",response.data);
  //     const vacationRentals = response?.data?.data || [];
  //     return vacationRentals.map((rental) => ({
  //       rentalId: rental?.id || uuidv4(),
  //       name: rental?.name,
  //       description: rental?.description,
  //       category: rental?.category,
  //       amenities: rental?.amenities || [],
  //       bathCount: rental?.bathCount,
  //       roomCount: rental?.roomCount,
  //       sleepCount: rental?.sleepCount,
  //       pricePerNight: rental?.pricePerNight?.[0]?.rate?.amountUSD || rental?.pricePerNight?.[0]?.rate?.amount || 0,
  //       currency: rental?.currency,
  //       rating: rental?.rating,
  //       reviewsCount: rental?.reviewsCount,
  //       location: {
  //         latitude: rental?.latitude,
  //         longitude: rental?.longitude,
  //       },
  //       logo: rental?.logo,
  //       photos: rental?.photos || [],
  //       url: rental?.url,
  //     }));
  //   } catch (error) {
  //     console.error('Error fetching vacation rentals from API:', error.message);
  //     throw new Error('Failed to fetch vacation rentals from API');
  //   }
  // };



const fetchHotels = async (req, res) => {
    const { location, checkIn = getTodayAndNext7thDay()?.today, checkOut = getTodayAndNext7thDay()?.next7thDay, sort = 'BEST_VALUE', locale = 'en-US', currency = 'INR' } = req.body;

  try {

    // Check if data exists in the database
    let placeData = await Place.findOne({ place:location?.toLowerCase() });
    if (placeData) {
        // Check if hotels are missing but restaurants exist
        if ((!placeData.hotels || placeData.hotels.length === 0)) {
          const formattedHotels = await fetchHotelsFromAPI(location, checkIn, checkOut);
          placeData.hotels = formattedHotels;
          await placeData.save();
        }
  
        // Check if restaurants are missing but hotels exist
        if ((!placeData.restaurants || placeData.restaurants.length === 0)) {
          const formattedRestaurants = await fetchRestaurantsFromAPI(location);
          placeData.restaurants = formattedRestaurants;
          await placeData.save();
        }

        if ((!placeData.tours || placeData.tours.length === 0)) {
          const formattedTours = await fetchToursFromAPI(location, checkIn, checkOut);
          placeData.tours = formattedTours;
          await placeData.save();
        }

       
        // if ((!placeData.vacationRentals || placeData.vacationRentals.length === 0)) {
        //   const formattedVacationRentals = await fetchVacationRentsFromAPI(location, checkIn, checkOut);
        //   placeData.vacationRentals = formattedVacationRentals;
        //   await placeData.save();
        // }
  
        return res.json({ source: 'db', data: placeData });
      }

    const formattedHotels = await fetchHotelsFromAPI(location, checkIn, checkOut);
    const formattedRestaurants = await fetchRestaurantsFromAPI(location);
    const formattedTours = await fetchToursFromAPI(location, checkIn, checkOut);
    // const formattedVacationRentals = await fetchVacationRentsFromAPI(location, checkIn, checkOut);

    const newPlace = new Place({ place:location?.toLowerCase(), hotels:formattedHotels,restaurants: formattedRestaurants, tours:formattedTours});
    await newPlace.save();

    return res.json({ source: 'api', data: newPlace });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { fetchHotels };
