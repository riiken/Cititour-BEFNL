const axios = require('axios');
const Place = require('../model/Hotel');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { createTtlCache } = require('../utils/ttlCache');

// Cities whose provider fetch recently failed: don't retry (and pay) on every request
const recentFailures = createTtlCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1000 });

// Cached city data is refreshed after this many days; stale data is still
// served if the refresh fails.
const PLACE_CACHE_MAX_AGE_MS = Number(process.env.PLACE_CACHE_DAYS || 7) * 24 * 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 15000;
// A city legitimately missing a category (e.g. no tours) is retried at most daily.
const MISSING_CATEGORY_RETRY_MS = 24 * 60 * 60 * 1000;

const formatDate = (date) => date.toISOString().slice(0, 10);

const defaultDates = () => {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  return { today: formatDate(today), next7thDay: formatDate(nextWeek) };
};

const normaliseCity = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const providerRequest = (path, params) =>
  axios.get(process.env.TRIPADVISOR_API_URL + path, {
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'real-time-tripadvisor-scraper-api.p.rapidapi.com'
    },
    params,
    timeout: PROVIDER_TIMEOUT_MS
  });

const fetchHotelsFromAPI = async (location, checkIn, checkOut) => {
  const response = await providerRequest('/tripadvisor_hotels_search_v2', { location, checkIn, checkOut });
  const hotels = response?.data?.data || [];
  return hotels.filter((hotel) => hotel?.name).map((hotel) => ({
    hotelId: String(hotel?.id ?? uuidv4()),
    name: hotel?.name,
    rating: hotel?.rating,
    reviewsCount: hotel?.reviewsCount,
    priceMin: hotel?.price?.priceMin,
    priceMax: hotel?.price?.priceMax,
    amenities: hotel?.amenities || [],
    categoryTitle: hotel?.categoryTitle,
    contacts: {
      streetAddress: hotel?.address?.fullAddress,
      city: hotel?.address?.city,
      state: hotel?.address?.state,
      country: hotel?.address?.country,
      postalCode: hotel?.address?.postalCode,
      telephone: hotel?.address?.telephone,
      phone: hotel?.contacts?.phone,
      email: hotel?.contacts?.email,
      website: hotel?.contacts?.website
    },
    location: {
      latitude: hotel?.address?.latitude,
      longitude: hotel?.address?.longitude
    },
    thumbnail: hotel?.thumbnail,
    url: hotel?.link,
    ranking: hotel?.ranking,
    currency: hotel?.price?.currency,
    typeTitle: hotel?.typeTitle,
    photos: hotel?.photos,
    styles: hotel?.styles
  }));
};

const fetchRestaurantsFromAPI = async (location, sort = 'FEATURED', locale = 'en-US', currency = 'INR') => {
  const response = await providerRequest('/tripadvisor_restaurants_search_v2', { location, sort, locale, currency });
  const restaurants = response?.data?.data || [];
  return restaurants.filter((restaurant) => restaurant?.name).map((restaurant) => ({
    name: restaurant?.name,
    rating: restaurant?.rating,
    reviewsCount: restaurant?.reviewsCount,
    priceTypes: restaurant?.priceTypes,
    cuisines: restaurant?.cuisines || [],
    link: restaurant?.link,
    address: restaurant?.address,
    phone: restaurant?.telephone?.toString(),
    photos: restaurant?.photos,
    menu: restaurant?.menu,
    thumbnail: restaurant?.thumbnail,
    openStatus: restaurant?.openStatus,
    openStatusText: restaurant?.openStatusText,
    currency: restaurant?.currency,
    id: restaurant?.id?.toString()
  }));
};

const fetchToursFromAPI = async (location, checkIn, checkOut) => {
  const response = await providerRequest('/tripadvisor_tours_search_v2', { location, checkIn, checkOut });
  const tours = response?.data?.data || [];
  return tours.filter((tour) => tour?.title).map((tour) => ({
    image: tour?.image,
    id: tour?.id,
    photos: tour?.photos,
    title: tour?.title,
    description: tour?.description,
    category: tour?.category,
    duration: tour?.duration,
    cancellation: tour?.cancellation,
    languages: tour?.languages || [],
    operator: tour?.operator,
    price: tour?.price?.total,
    rating: tour?.rating,
    reviewsCount: tour?.reviewsCount,
    url: tour?.url,
    currency: tour?.price?.currency
  }));
};

/**
 * Fetch all three categories in parallel. A failing category yields null so
 * the others can still be used.
 */
const fetchAllCategories = async ({ location, checkIn, checkOut, currency }) => {
  const results = await Promise.allSettled([
    fetchHotelsFromAPI(location, checkIn, checkOut),
    fetchRestaurantsFromAPI(location, undefined, undefined, currency),
    fetchToursFromAPI(location, checkIn, checkOut)
  ]);

  const [hotels, restaurants, tours] = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    logger.warn('Provider category fetch failed', {
      category: ['hotels', 'restaurants', 'tours'][index],
      location,
      error: result.reason && result.reason.message
    });
    return null;
  });

  return { hotels, restaurants, tours };
};

/**
 * Return cached hotels/restaurants/tours for a city, refreshing from the
 * provider when the cache is stale or missing.
 *
 * @returns {Promise<{source: 'db'|'api', stale?: boolean, place: Object|null}>}
 *   `place` is a Mongoose document, or null when nothing is available.
 */
const getCityListings = async ({ location, checkIn, checkOut, currency = 'INR' }) => {
  const dates = defaultDates();
  checkIn = checkIn || dates.today;
  checkOut = checkOut || dates.next7thDay;
  const cityKey = normaliseCity(location);

  const placeData = await Place.findOne({ place: cityKey });
  const ageMs = placeData ? Date.now() - new Date(placeData.refreshedAt || placeData.createdAt).getTime() : Infinity;
  const missingCategory = placeData && ['hotels', 'restaurants', 'tours'].some((key) => !placeData[key]?.length);
  const shouldRetryMissing = missingCategory && ageMs > MISSING_CATEGORY_RETRY_MS;

  if (placeData && ageMs < PLACE_CACHE_MAX_AGE_MS && !shouldRetryMissing) {
    return { source: 'db', place: placeData };
  }

  if (!process.env.RAPIDAPI_KEY || !process.env.TRIPADVISOR_API_URL) {
    return { source: 'db', stale: Boolean(placeData), place: placeData };
  }

  if (recentFailures.get(cityKey)) {
    return { source: 'db', stale: Boolean(placeData), place: placeData };
  }

  const fresh = await fetchAllCategories({ location: String(location).trim(), checkIn, checkOut, currency });
  const hasAnyResults = ['hotels', 'restaurants', 'tours'].some((key) => fresh[key]?.length);

  if (!hasAnyResults) {
    recentFailures.set(cityKey, true);
    // Refresh failed: serve what we have (possibly nothing). Empty results are not cached.
    return { source: placeData ? 'db' : 'api', stale: Boolean(placeData), place: placeData };
  }

  const update = { refreshedAt: new Date() };
  for (const key of ['hotels', 'restaurants', 'tours']) {
    // Only overwrite a category when the provider returned data for it.
    if (fresh[key]?.length) update[key] = fresh[key];
  }

  const saved = await Place.findOneAndUpdate(
    { place: cityKey },
    { $set: update, $setOnInsert: { place: cityKey } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { source: 'api', place: saved };
};

module.exports = { getCityListings, normaliseCity, defaultDates, recentFailures };
