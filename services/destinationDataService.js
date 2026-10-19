const { politeGet } = require('../config/http');
const City = require('../model/City');
const logger = require('../config/logger');
const { fetchGuide } = require('./wikivoyageService');

/**
 * Real-world grounding data for itineraries:
 *  - geocoding via OpenStreetMap Nominatim (usage policy: identify the app,
 *    max 1 request/second, cache results - we cache for 180 days)
 *  - attractions via Wikipedia geosearch (articles with coordinates)
 */

const GEOCODE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const ATTRACTIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const WIKI_RADIUS_M = 10000; // API maximum
const MAX_ATTRACTIONS = 80;

// Wikipedia short descriptions that indicate the page is not a visitor attraction
const NOT_ATTRACTION = /\b(railway|station|school|college|universit|institute|hospital|medical|airport|company|constituency|election|census|tehsil|taluka|district|village|neighbou?rhood|suburb|ward|road|street|highway|bank|stadium|cricket|club|newspaper|organi[sz]ation|government|ministry|court|residence|office|facility|power station|dam|barrage|kingdom|dynasty|person|politician|actor|film|album|species|genus)\b/i;
// Places worth visiting tend to have one of these in their description or title
const LIKELY_ATTRACTION = /\b(temple|fort|palace|lake|museum|ghat|beach|church|cathedral|basilica|mosque|dargah|gurudwara|monastery|waterfall|falls|park|sanctuary|reserve|garden|monument|memorial|cenotaph|haveli|ashram|viewpoint|cave|island|market|bazaar|(?:foot)?bridge|jhula|setu|tomb|stepwell|observatory|zoo|gallery|heritage|historic|ruins|valley|hill|peak|trek|lighthouse|square|promenade|art installation)\b/i;

const normaliseKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const distanceKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const geocode = async (query) => {
  const response = await politeGet('https://nominatim.openstreetmap.org/search', {
    params: { q: query, format: 'json', limit: 1, addressdetails: 0 },
    headers: { 'Accept-Language': 'en' },
    timeout: 8000
  });
  const result = response.data && response.data[0];
  if (!result) return null;
  return {
    lat: Number(result.lat),
    lon: Number(result.lon),
    displayName: result.display_name,
    name: String(result.display_name || query).split(',')[0].trim(),
    bbox: (result.boundingbox || []).map(Number)
  };
};

/**
 * Search points for Wikipedia geosearch. One search covers a 10 km radius, so
 * large regions (e.g. Goa, Kerala) get the centre plus points spread across
 * the bounding box.
 */
const searchPoints = (city) => {
  const centre = { lat: city.lat, lon: city.lon };
  const [south, north, west, east] = city.bbox || [];
  if (![south, north, west, east].every(Number.isFinite)) return [centre];

  const diagonalKm = distanceKm({ lat: south, lon: west }, { lat: north, lon: east });
  if (diagonalKm <= 25) return [centre];

  const latStep = (north - south) / 4;
  const lonStep = (east - west) / 4;
  return [
    centre,
    { lat: south + latStep, lon: west + lonStep },
    { lat: south + latStep, lon: east - lonStep },
    { lat: north - latStep, lon: west + lonStep },
    { lat: north - latStep, lon: east - lonStep }
  ];
};

const wikiGeosearch = async ({ lat, lon }) => {
  const response = await politeGet('https://en.wikipedia.org/w/api.php', {
    params: {
      action: 'query',
      format: 'json',
      generator: 'geosearch',
      ggscoord: `${lat}|${lon}`,
      ggsradius: WIKI_RADIUS_M,
      ggslimit: 100,
      prop: 'coordinates|description'
    },
    timeout: 8000
  });
  return Object.values((response.data && response.data.query && response.data.query.pages) || {});
};

const toAttraction = (page) => {
  const coordinates = (page.coordinates && page.coordinates[0]) || {};
  return {
    source: 'wikipedia',
    pageId: page.pageid,
    name: page.title,
    description: page.description || '',
    lat: coordinates.lat,
    lon: coordinates.lon,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`
  };
};

/**
 * Keep pages that look like places to visit. Pages with no description are
 * kept only if their title looks like an attraction.
 */
const isAttraction = (page) => {
  const description = page.description || '';
  if (NOT_ATTRACTION.test(description)) return false;
  return LIKELY_ATTRACTION.test(description) || LIKELY_ATTRACTION.test(page.title || '');
};

const fetchAttractions = async (city) => {
  const results = await Promise.allSettled(searchPoints(city).map(wikiGeosearch));
  const pages = new Map();
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const page of result.value) pages.set(page.pageid, page);
  }
  if (results.every((result) => result.status === 'rejected')) {
    throw new Error('Wikipedia geosearch failed');
  }
  return [...pages.values()]
    .filter(isAttraction)
    .map(toAttraction)
    .filter((attraction) => Number.isFinite(attraction.lat) && Number.isFinite(attraction.lon))
    .sort((a, b) => distanceKm(city, a) - distanceKm(city, b))
    .slice(0, MAX_ATTRACTIONS);
};

const sameName = (a, b) => {
  const clean = (value) => normaliseKey(value).replace(/[^\p{L}\p{N} ]/gu, '').replace(/^the /, '');
  const x = clean(a);
  const y = clean(b);
  return x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x)));
};

const fromGuide = (listing) => ({
  source: 'wikivoyage',
  name: listing.name,
  description: listing.description,
  area: listing.area || listing.region,
  lat: listing.lat,
  lon: listing.lon,
  price: listing.price,
  priceMin: listing.priceMin,
  url: listing.url
});

/**
 * Load real places for a destination: Wikivoyage listings (attractions,
 * restaurants, hotels) plus Wikipedia geosearch attractions. Each source is
 * optional; failures are logged and the other source is still used.
 */
const fetchPlaces = async (city, query) => {
  const [guideResult, wikiResult] = await Promise.allSettled([
    fetchGuide(city.name || query),
    fetchAttractions(city)
  ]);

  const guide = guideResult.status === 'fulfilled' ? guideResult.value : null;
  if (guideResult.status === 'rejected') {
    logger.warn('Wikivoyage fetch failed', { query, error: guideResult.reason && guideResult.reason.message });
  }
  const wikiAttractions = wikiResult.status === 'fulfilled' ? wikiResult.value : [];
  if (wikiResult.status === 'rejected') {
    logger.warn('Wikipedia attractions fetch failed', { query, error: wikiResult.reason && wikiResult.reason.message });
  }

  // Curated guide sights first, then Wikipedia places not already listed
  const attractions = (guide ? guide.attractions.map(fromGuide) : []);
  for (const attraction of wikiAttractions) {
    const duplicate = attractions.find((existing) => sameName(existing.name, attraction.name));
    if (duplicate) {
      // Keep the guide's description, borrow Wikipedia's coordinates
      if (!Number.isFinite(duplicate.lat)) Object.assign(duplicate, { lat: attraction.lat, lon: attraction.lon });
    } else {
      attractions.push(attraction);
    }
  }

  return {
    attractions: attractions.slice(0, MAX_ATTRACTIONS),
    hotels: guide ? guide.hotels.map(fromGuide).slice(0, 40) : [],
    restaurants: guide ? guide.restaurants.map(fromGuide).slice(0, 40) : [],
    guide: guide ? { title: guide.title, url: guide.url } : undefined
  };
};

/**
 * Geocode a destination and load its real places, using the cache when fresh.
 * Returns null when the destination cannot be found.
 */
const getDestination = async (query) => {
  const key = normaliseKey(query);
  let city = await City.findOne({ key });

  const geocodeFresh = city && city.geocodedAt && Date.now() - city.geocodedAt.getTime() < GEOCODE_MAX_AGE_MS;
  if (!geocodeFresh) {
    const result = await geocode(query).catch((error) => {
      logger.warn('Geocoding failed', { query, error: error.message });
      return null;
    });
    if (!result) return city && city.lat ? city : null;
    city = await City.findOneAndUpdate(
      { key },
      { $set: { ...result, geocodedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const placesFresh = city.attractionsFetchedAt &&
    Date.now() - city.attractionsFetchedAt.getTime() < ATTRACTIONS_MAX_AGE_MS &&
    city.attractions.length > 0;
  if (!placesFresh) {
    const places = await fetchPlaces(city, query);
    if (places.attractions.length || places.hotels.length) {
      Object.assign(city, places, { attractionsFetchedAt: new Date() });
      await city.save();
    }
  }

  return city;
};

module.exports = { getDestination, geocode, isAttraction, searchPoints, distanceKm, normaliseKey, sameName };
