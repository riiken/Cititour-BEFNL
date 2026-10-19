const crypto = require('crypto');
const Itinerary = require('../model/Itinerary');
const Event = require('../model/Event');
const logger = require('../config/logger');
const { getDestination, normaliseKey } = require('../services/destinationDataService');
const { getCityListings } = require('../services/listingsService');
const { planItinerary, ITINERARY_PROMPT_VERSION } = require('../services/itineraryPlanner');
const { reserveAiGeneration } = require('../services/aiBudget');
const { mapsSearchLink, hotelBookingLink, activityBookingLink } = require('../services/linkBuilder');
const { withPlaceLinks } = require('../services/placeLinks');
const { buildIcs, buildPackingList } = require('../services/tripExtras');
const { appUrl } = require('../config/mailer');
const { findApprovedNear } = require('../services/listingService');
const { distanceKm } = require('../services/destinationDataService');

// Identical requests within this window reuse the stored plan (no AI cost)
const REUSE_WINDOW_MS = Number(process.env.ITINERARY_REUSE_DAYS || 7) * 24 * 60 * 60 * 1000;

const newPublicId = () => crypto.randomBytes(9).toString('base64url');

const buildCacheKey = (request) => [
  ITINERARY_PROMPT_VERSION,
  normaliseKey(request.destination),
  request.checkIn,
  request.checkOut,
  request.travellers,
  normaliseKey(request.budget),
  (request.interests || []).map(normaliseKey).sort().join(','),
  request.language || 'en'
].join('|');

/** A private copy of a plan for a user (their own share link, editable). */
const copyForUser = async (source, userId) => {
  const data = source.toObject();
  delete data._id;
  delete data.__v;
  delete data.createdAt;
  delete data.updatedAt;
  return Itinerary.create({
    ...data,
    publicId: newPublicId(),
    userId,
    views: 0,
    copiedFrom: source.publicId
  });
};

const snapshot = (candidate) => {
  const { id, zone, ...place } = candidate;
  return place;
};

/**
 * Attach maps/booking links at response time (affiliate settings always
 * current; nothing link-related is stored).
 */
const present = (itinerary, viewer) => {
  const data = typeof itinerary.toJSON === 'function' ? itinerary.toJSON() : itinerary;
  const { request } = data;
  const city = (data.destination && data.destination.name) || request.destination;
  const adults = Number.isInteger(request.travellers) ? request.travellers : undefined;

  const withItemLinks = (place) => withPlaceLinks(place, {
    city, checkIn: request.checkIn, checkOut: request.checkOut, travellers: request.travellers
  });

  return {
    id: data.publicId,
    title: data.title,
    summary: data.summary,
    request,
    destination: data.destination,
    days: (data.days || []).map((day) => {
      const firstPlace = (day.items || []).find((item) => item.place && item.place.kind !== 'restaurant');
      const hasMeals = (day.items || []).some((item) => item.place && item.place.kind === 'restaurant');
      return {
        ...day,
        items: (day.items || []).map((item) => ({ ...item, place: withItemLinks(item.place) })),
        // When we have no restaurant data, offer an honest "find food nearby" link
        ...(!hasMeals && {
          foodNearbyLink: mapsSearchLink(`restaurants near ${firstPlace ? firstPlace.place.name : city}`, city)
        })
      };
    }),
    stays: (data.stays || []).map((stay) => ({ ...stay, place: withItemLinks(stay.place) })),
    hasPartners: [...(data.stays || []), ...(data.days || []).flatMap((day) => day.items || [])]
      .some((entry) => entry.place && entry.place.partner),
    links: {
      allStays: hotelBookingLink({ city, checkIn: request.checkIn, checkOut: request.checkOut, adults }),
      allActivities: activityBookingLink({ city })
    },
    budget: data.budget,
    tips: data.tips,
    sources: data.sources,
    guide: data.guide,
    generatedBy: data.generatedBy && data.generatedBy.method,
    canEdit: Boolean(viewer && data.userId && String(data.userId) === String(viewer.id)),
    edited: Boolean(data.edited),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

const createItinerary = async (req, res, next) => {
  const request = {
    destination: req.body.destination.trim(),
    checkIn: req.body.checkIn,
    checkOut: req.body.checkOut,
    travellers: req.body.travellers || 2,
    budget: req.body.budget || 'Mid-range',
    interests: Array.isArray(req.body.interests) ? req.body.interests.slice(0, 10) : [],
    language: req.body.language === 'hi' ? 'hi' : 'en'
  };
  const cacheKey = buildCacheKey(request);

  try {
    // Reuse a recent untouched anonymous plan (no AI cost). Logged-in users
    // get their own copy so later edits stay private.
    const recent = await Itinerary.findOne({
      cacheKey,
      userId: null,
      edited: { $ne: true },
      createdAt: { $gte: new Date(Date.now() - REUSE_WINDOW_MS) }
    }).sort({ createdAt: -1 });
    if (recent) {
      const plan = req.user ? await copyForUser(recent, req.user.id) : recent;
      return res.status(200).json({ success: true, data: present(plan, req.user), reused: true });
    }

    const city = await getDestination(request.destination);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: `We couldn't find "${request.destination}". Try a city or region name, e.g. "Udaipur" or "Goa".`
      });
    }

    const listingsResult = await getCityListings({
      location: request.destination,
      checkIn: request.checkIn,
      checkOut: request.checkOut
    }).catch((error) => {
      logger.warn('Listings unavailable for itinerary', { destination: request.destination, error: error.message });
      return { place: null };
    });
    const listings = listingsResult.place;

    const hasData = (city.attractions || []).length || (city.hotels || []).length ||
      (listings && ['hotels', 'restaurants', 'tours'].some((key) => (listings[key] || []).length));
    if (!hasData) {
      return res.status(422).json({
        success: false,
        message: `We don't have enough information about "${request.destination}" yet. Try a nearby larger town.`
      });
    }

    // Owner-listed businesses near the destination (wider radius for regions)
    const [south, north, west, east] = city.bbox || [];
    const regionKm = [south, north, west, east].every(Number.isFinite)
      ? distanceKm({ lat: south, lon: west }, { lat: north, lon: east }) : 0;
    const partners = await findApprovedNear(city, regionKm > 25 ? 60 : 25).catch((error) => {
      logger.warn('Partner listings unavailable', { error: error.message });
      return [];
    });

    const useAi = await reserveAiGeneration();
    const { plan, candidates, generatedBy } = await planItinerary({ request, city, listings, partners, useAi });

    const resolve = (candidateId) => {
      const candidate = candidates.byId.get(candidateId);
      return candidate ? snapshot(candidate) : null;
    };

    const sources = [];
    if (city.guide && city.guide.title) sources.push('Wikivoyage');
    if ((city.attractions || []).some((place) => place.source === 'wikipedia')) sources.push('Wikipedia');
    if (listings && ['hotels', 'restaurants', 'tours'].some((key) => (listings[key] || []).length)) sources.push('Tripadvisor');
    sources.push('OpenStreetMap');

    const itinerary = await Itinerary.create({
      publicId: newPublicId(),
      cacheKey,
      userId: req.user && req.user.id,
      request,
      destination: { name: city.name, displayName: city.displayName, lat: city.lat, lon: city.lon },
      guide: city.guide && city.guide.title ? { title: city.guide.title, url: city.guide.url } : undefined,
      title: plan.title || `${request.destination} trip`,
      summary: plan.summary,
      days: plan.days.map((day) => ({
        day: day.day,
        date: day.date,
        kind: day.kind,
        theme: day.theme,
        items: day.items
          .map((item) => ({ slot: item.slot, note: item.note, place: resolve(item.candidateId) }))
          .filter((item) => item.place)
      })),
      stays: plan.stays
        .map((stay) => ({ note: stay.note, place: resolve(stay.candidateId) }))
        .filter((stay) => stay.place),
      budget: plan.budget,
      tips: plan.tips,
      sources,
      generatedBy
    });

    logger.info('Itinerary created', {
      id: itinerary.publicId,
      destination: request.destination,
      method: generatedBy.method,
      days: itinerary.days.length,
      stays: itinerary.stays.length
    });

    return res.status(201).json({ success: true, data: present(itinerary, req.user) });
  } catch (error) {
    return next(error);
  }
};

const getItinerary = async (req, res, next) => {
  try {
    const itinerary = await Itinerary.findOneAndUpdate(
      { publicId: req.params.id },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!itinerary) {
      return res.status(404).json({ success: false, message: 'This trip plan was not found.' });
    }
    return res.json({ success: true, data: present(itinerary, req.user) });
  } catch (error) {
    return next(error);
  }
};

/** GET /itineraries/:id/calendar.ics: the plan as calendar events. */
const calendar = async (req, res, next) => {
  try {
    const itinerary = await Itinerary.findOne({ publicId: req.params.id });
    if (!itinerary) return res.status(404).json({ success: false, message: 'This trip plan was not found.' });
    const trip = present(itinerary);
    const tripUrl = `${appUrl()}/trip/${trip.id}`;
    const filename = `${(trip.destination.name || 'trip').replace(/[^\w-]+/g, '-').toLowerCase()}-trip.ics`;
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    return res.send(buildIcs(trip, tripUrl));
  } catch (error) {
    return next(error);
  }
};

/** GET /itineraries/:id/packing: rule-based packing checklist for the trip. */
const packing = async (req, res, next) => {
  try {
    const itinerary = await Itinerary.findOne({ publicId: req.params.id }).lean();
    if (!itinerary) return res.status(404).json({ success: false, message: 'This trip plan was not found.' });
    return res.json({ success: true, data: buildPackingList(itinerary) });
  } catch (error) {
    return next(error);
  }
};

const recordEvent = async (req, res) => {
  const { type, partner, placement, itineraryId, destination } = req.body;
  try {
    await Event.create({ type, partner, placement, itineraryId, destination, userId: req.user && req.user.id });
  } catch (error) {
    logger.warn('Failed to record event', { error: error.message });
  }
  // Tracking must never break the user's click
  return res.status(204).end();
};

module.exports = { createItinerary, getItinerary, calendar, packing, recordEvent, present, buildCacheKey, copyForUser, newPublicId, snapshot };
