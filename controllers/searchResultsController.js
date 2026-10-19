const logger = require('../config/logger');
const { hotelBookingLink, activityBookingLink, mapsSearchLink } = require('../services/linkBuilder');
const { getCityListings, normaliseCity, defaultDates } = require('../services/listingsService');

/**
 * Add booking/maps links at response time so affiliate settings always apply.
 */
const withLinks = (place, { checkIn, checkOut, displayCity }) => {
  const data = typeof place.toJSON === 'function' ? place.toJSON() : place;
  const city = displayCity || data.place;
  return {
    ...data,
    hotels: (data.hotels || []).map((hotel) => ({
      ...hotel,
      bookingUrl: hotelBookingLink({ name: hotel.name, city, checkIn, checkOut })
    })),
    restaurants: (data.restaurants || []).map((restaurant) => ({
      ...restaurant,
      mapsUrl: mapsSearchLink(restaurant.name, city)
    })),
    tours: (data.tours || []).map((tour) => ({
      ...tour,
      bookingUrl: activityBookingLink({ name: tour.title, city })
    }))
  };
};

const fetchHotels = async (req, res) => {
  const dates = defaultDates();
  const {
    location,
    checkIn = dates.today,
    checkOut = dates.next7thDay,
    currency = 'INR'
  } = req.body;
  const cityKey = normaliseCity(location);
  const linkContext = { checkIn, checkOut, displayCity: String(location).trim() };

  try {
    const { source, stale, place } = await getCityListings({ location, checkIn, checkOut, currency });
    if (!place) {
      return res.json({ source, data: { place: cityKey, hotels: [], restaurants: [], tours: [] } });
    }
    return res.json({ source, ...(stale && { stale: true }), data: withLinks(place, linkContext) });
  } catch (error) {
    logger.error('City search failed', { location: cityKey, error: error.message });
    return res.status(500).json({ success: false, message: 'Search is temporarily unavailable. Please try again.' });
  }
};

module.exports = { fetchHotels, withLinks };
