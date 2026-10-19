const Place = require('../model/Hotel');
const { getDestination, distanceKm } = require('../services/destinationDataService');
const { normaliseCity } = require('../services/listingsService');
const { findApprovedNear } = require('../services/listingService');
const { buildCandidates } = require('../services/itineraryPlanner');
const { withPlaceLinks } = require('../services/placeLinks');
const { hotelBookingLink, activityBookingLink } = require('../services/linkBuilder');
const { createTtlCache } = require('../utils/ttlCache');

const MAX_PER_SECTION = 40;

// Candidate building is deterministic; cache per destination for a few minutes
const poolCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 300 });

const strip = ({ id, zone, ...place }) => place;

/**
 * Real places for a destination, grouped for browsing.
 * GET /api/v1/explore/:destination?checkIn=&checkOut=&travellers=
 * Uses cached/free data only (no paid provider calls).
 */
const explore = async (req, res, next) => {
  try {
    const destination = req.params.destination.trim();
    const pool = await poolCache.wrap(normaliseCity(destination), async () => {
      const city = await getDestination(destination);
      if (!city) return null;
      const listings = await Place.findOne({ place: normaliseCity(destination) }).lean();
      const [south, north, west, east] = city.bbox || [];
      const regionKm = [south, north, west, east].every(Number.isFinite)
        ? distanceKm({ lat: south, lon: west }, { lat: north, lon: east }) : 0;
      const partners = await findApprovedNear(city, regionKm > 25 ? 60 : 25).catch(() => []);
      return { city, candidates: buildCandidates(city, listings, 3, partners) };
    });

    if (!pool) {
      return res.status(404).json({
        success: false,
        message: `We couldn't find "${destination}". Try a city or region name, e.g. "Udaipur" or "Goa".`
      });
    }

    const { city, candidates } = pool;
    const context = {
      city: city.name || destination,
      checkIn: req.query.checkIn,
      checkOut: req.query.checkOut,
      travellers: req.query.travellers
    };
    const section = (list) => list.slice(0, MAX_PER_SECTION).map((place) => withPlaceLinks(strip(place), context));

    const sections = {
      see: section(candidates.attractions),
      do: section(candidates.tours),
      stay: section(candidates.hotels.length ? candidates.hotels : candidates.stayAreas || []),
      eat: section(candidates.restaurants)
    };

    return res.json({
      success: true,
      data: {
        destination: { name: city.name, displayName: city.displayName, lat: city.lat, lon: city.lon },
        guide: city.guide && city.guide.title ? { title: city.guide.title, url: city.guide.url } : undefined,
        sections,
        counts: Object.fromEntries(Object.entries(sections).map(([key, list]) => [key, list.length])),
        links: {
          allStays: hotelBookingLink({ city: context.city, checkIn: context.checkIn, checkOut: context.checkOut, adults: context.travellers }),
          allActivities: activityBookingLink({ city: context.city })
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { explore, poolCache };
