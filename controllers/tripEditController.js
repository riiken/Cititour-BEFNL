const Itinerary = require('../model/Itinerary');
const Place = require('../model/Hotel');
const { ApiError } = require('../middleware/errorHandler');
const { getDestination, distanceKm } = require('../services/destinationDataService');
const { normaliseCity } = require('../services/listingsService');
const { findApprovedNear } = require('../services/listingService');
const { buildCandidates } = require('../services/itineraryPlanner');
const { present, copyForUser, snapshot } = require('./itineraryController');

const MAX_ITEMS_PER_DAY = 8;
const MAX_STAYS = 4;
const ACTIVITY_SLOTS = ['morning', 'afternoon', 'evening'];
const MEAL_SLOTS = ['lunch', 'dinner'];
const SLOT_ORDER = ['morning', 'lunch', 'afternoon', 'evening', 'dinner'];

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const loadOwned = async (req) => {
  const itinerary = await Itinerary.findOne({ publicId: req.params.id });
  if (!itinerary) throw new ApiError(404, 'This trip plan was not found.');
  if (!itinerary.userId || String(itinerary.userId) !== req.user.id) {
    throw new ApiError(403, 'Save this trip to your account to edit it.');
  }
  return itinerary;
};

/**
 * Real places this trip may use: the same pool the planner uses (cached
 * city data, cached listings, approved partner businesses). No AI and no
 * paid provider calls.
 */
const candidatePool = async (itinerary) => {
  const city = await getDestination(itinerary.request.destination);
  if (!city) return null;
  const listings = await Place.findOne({ place: normaliseCity(itinerary.request.destination) }).lean();
  const [south, north, west, east] = city.bbox || [];
  const regionKm = [south, north, west, east].every(Number.isFinite)
    ? distanceKm({ lat: south, lon: west }, { lat: north, lon: east }) : 0;
  const partners = await findApprovedNear(city, regionKm > 25 ? 60 : 25).catch(() => []);
  return buildCandidates(city, listings, Math.max(1, itinerary.days.length - 1), partners);
};

const kindsFor = (group) => ({
  activity: ['attraction', 'tour'],
  meal: ['restaurant'],
  stay: ['hotel', 'area']
}[group] || []);

const allCandidates = (pool) => [
  ...pool.attractions, ...pool.tours, ...pool.restaurants, ...pool.hotels, ...(pool.stayAreas || [])
];

/** Find a real candidate by kind + name (client input is never trusted as place data). */
const resolvePlace = (pool, place) => {
  if (!place || !place.name || !place.kind) return null;
  const match = allCandidates(pool).find((candidate) => candidate.kind === place.kind && sameName(candidate.name, place.name));
  return match ? snapshot(match) : null;
};

const usedNames = (itinerary) => new Set([
  ...itinerary.days.flatMap((day) => day.items.map((item) => item.place && item.place.name)),
  ...itinerary.stays.map((stay) => stay.place && stay.place.name)
].filter(Boolean).map((name) => name.toLowerCase()));

const sortDay = (day) => {
  day.items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
};

// ---------------------------------------------------------------- handlers

const myTrips = async (req, res, next) => {
  try {
    const trips = await Itinerary.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('publicId title request destination days stays updatedAt createdAt edited')
      .lean();
    res.json({
      success: true,
      data: trips.map((trip) => ({
        id: trip.publicId,
        title: trip.title,
        destination: trip.destination && trip.destination.name,
        checkIn: trip.request.checkIn,
        checkOut: trip.request.checkOut,
        travellers: trip.request.travellers,
        days: (trip.days || []).length,
        stops: (trip.days || []).reduce((sum, day) => sum + (day.items || []).length, 0),
        edited: Boolean(trip.edited),
        updatedAt: trip.updatedAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

/** Save a trip (e.g. one shared by a friend) as the user's own editable copy. */
const saveCopy = async (req, res, next) => {
  try {
    const source = await Itinerary.findOne({ publicId: req.params.id });
    if (!source) throw new ApiError(404, 'This trip plan was not found.');
    if (source.userId && String(source.userId) === req.user.id) {
      return res.json({ success: true, data: present(source, req.user), alreadyOwned: true });
    }
    const copy = await copyForUser(source, req.user.id);
    return res.status(201).json({ success: true, data: present(copy, req.user) });
  } catch (error) {
    return next(error);
  }
};

const deleteTrip = async (req, res, next) => {
  try {
    const itinerary = await loadOwned(req);
    await itinerary.deleteOne();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

/**
 * Places that could be added or swapped in, nearest to the day's stops first.
 * GET /itineraries/:id/alternatives?group=activity|meal|stay&day=2
 */
const alternatives = async (req, res, next) => {
  try {
    const itinerary = await loadOwned(req);
    const pool = await candidatePool(itinerary);
    if (!pool) return res.json({ success: true, data: [] });

    const used = usedNames(itinerary);
    const kinds = kindsFor(req.query.group);
    const day = itinerary.days.find((d) => d.day === Number(req.query.day));
    const located = (day ? day.items : []).map((item) => item.place).filter((p) => Number.isFinite(p.lat));
    const centre = located.length
      ? { lat: located.reduce((s, p) => s + p.lat, 0) / located.length, lon: located.reduce((s, p) => s + p.lon, 0) / located.length }
      : itinerary.destination;

    const options = allCandidates(pool)
      .filter((candidate) => kinds.includes(candidate.kind) && !used.has(String(candidate.name).toLowerCase()))
      .map((candidate) => {
        const place = snapshot(candidate);
        const km = Number.isFinite(place.lat) && centre && Number.isFinite(centre.lat) ? distanceKm(centre, place) : null;
        const { contact, ...publicPlace } = place;
        return { ...publicPlace, distanceKm: km === null ? null : Math.round(km * 10) / 10 };
      })
      .sort((a, b) => (b.partner ? 1 : 0) - (a.partner ? 1 : 0) || (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
      .slice(0, 30);

    return res.json({ success: true, data: options });
  } catch (error) {
    return next(error);
  }
};

/**
 * Apply one edit. Ops:
 *  remove {day, index} | move {day, index, toDay, slot} | add {day, slot, place}
 *  replace {day, index, place} | stay_remove {index} | stay_add {place} | title {title}
 */
const updateTrip = async (req, res, next) => {
  try {
    const itinerary = await loadOwned(req);
    const { op } = req.body;
    const dayOf = (number) => {
      const day = itinerary.days.find((d) => d.day === Number(number));
      if (!day) throw new ApiError(400, 'That day is not part of this trip');
      return day;
    };
    const itemOf = (day, index) => {
      const item = day.items[Number(index)];
      if (!item) throw new ApiError(400, 'That stop no longer exists. Refresh and try again.');
      return item;
    };
    const slotFits = (place, slot) => (place.kind === 'restaurant' ? MEAL_SLOTS : ACTIVITY_SLOTS).includes(slot);

    let pool = null;
    const needPlace = async () => {
      pool = pool || await candidatePool(itinerary);
      const place = pool && resolvePlace(pool, req.body.place);
      if (!place) throw new ApiError(400, 'That place is not available for this trip');
      if (usedNames(itinerary).has(place.name.toLowerCase()) && place.kind !== 'restaurant') {
        throw new ApiError(400, `${place.name} is already in your trip`);
      }
      return place;
    };

    if (op === 'remove') {
      const day = dayOf(req.body.day);
      itemOf(day, req.body.index);
      day.items.splice(Number(req.body.index), 1);
    } else if (op === 'move') {
      const from = dayOf(req.body.day);
      const item = itemOf(from, req.body.index);
      const to = dayOf(req.body.toDay);
      const slot = req.body.slot || item.slot;
      if (!slotFits(item.place, slot)) throw new ApiError(400, item.place.kind === 'restaurant' ? 'Restaurants go in lunch or dinner' : 'Pick morning, afternoon or evening');
      if (to !== from && to.items.length >= MAX_ITEMS_PER_DAY) throw new ApiError(400, `Day ${to.day} is full`);
      from.items.splice(Number(req.body.index), 1);
      item.slot = slot;
      to.items.push(item);
      sortDay(to);
    } else if (op === 'add') {
      const day = dayOf(req.body.day);
      if (day.items.length >= MAX_ITEMS_PER_DAY) throw new ApiError(400, `Day ${day.day} is full`);
      const place = await needPlace();
      const slot = req.body.slot;
      if (!slotFits(place, slot)) throw new ApiError(400, place.kind === 'restaurant' ? 'Restaurants go in lunch or dinner' : 'Pick morning, afternoon or evening');
      day.items.push({ slot, note: '', place });
      sortDay(day);
    } else if (op === 'replace') {
      const day = dayOf(req.body.day);
      const item = itemOf(day, req.body.index);
      const place = await needPlace();
      if (!slotFits(place, item.slot)) throw new ApiError(400, 'Swap with a place of the same kind (stop or meal)');
      day.items.splice(Number(req.body.index), 1, { slot: item.slot, note: '', place });
    } else if (op === 'stay_remove') {
      if (!itinerary.stays[Number(req.body.index)]) throw new ApiError(400, 'That stay no longer exists');
      itinerary.stays.splice(Number(req.body.index), 1);
    } else if (op === 'stay_add') {
      if (itinerary.stays.length >= MAX_STAYS) throw new ApiError(400, `Up to ${MAX_STAYS} stays`);
      const place = await needPlace();
      if (!['hotel', 'area'].includes(place.kind)) throw new ApiError(400, 'Pick a place to stay');
      itinerary.stays.push({ note: '', place });
    } else if (op === 'title') {
      itinerary.title = String(req.body.title).trim().slice(0, 100);
    } else {
      throw new ApiError(400, 'Unknown edit');
    }

    itinerary.edited = true;
    itinerary.markModified('days');
    itinerary.markModified('stays');
    await itinerary.save();
    res.json({ success: true, data: present(itinerary, req.user) });
  } catch (error) {
    next(error);
  }
};

module.exports = { myTrips, saveCopy, deleteTrip, alternatives, updateTrip };
