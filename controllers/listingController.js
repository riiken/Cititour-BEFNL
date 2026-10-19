const mongoose = require('mongoose');
const Listing = require('../model/Listing');
const ListingPhoto = require('../model/ListingPhoto');
const Event = require('../model/Event');
const Itinerary = require('../model/Itinerary');
const User = require('../model/User');
const logger = require('../config/logger');
const { ApiError } = require('../middleware/errorHandler');
const { presentListing, presentOwnListing } = require('../services/listingService');
const { normaliseKey } = require('../services/destinationDataService');
const { searchPlaces, reverseGeocode, locationFromPaste } = require('../services/locationService');
const notifications = require('../services/notificationService');

const MAX_PHOTOS = 6;
const MAX_LISTINGS_PER_OWNER = 20;

// Fields owners may set; everything else (status, featured, stats) is server-controlled
const EDITABLE_FIELDS = [
  'type', 'subtype', 'name', 'description', 'city', 'address', 'priceMin', 'priceMax', 'priceUnit',
  'amenities', 'cuisines', 'vegOnly', 'duration', 'openingHours', 'contact'
];

const pickEditable = (body) => {
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) update[field] = body[field];
  }
  if (update.city) update.cityKey = normaliseKey(update.city);
  if (body.lat !== undefined && body.lon !== undefined) {
    update.location = { type: 'Point', coordinates: [Number(body.lon), Number(body.lat)] };
  }
  return update;
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const loadOwned = async (req) => {
  if (!isValidId(req.params.id)) throw new ApiError(404, 'Listing not found');
  const listing = await Listing.findById(req.params.id);
  if (!listing) throw new ApiError(404, 'Listing not found');
  const isOwner = String(listing.ownerId) === req.user.id;
  if (!isOwner && req.user.role !== 'admin') throw new ApiError(404, 'Listing not found');
  return listing;
};

// ---------------------------------------------------------------- partner

const createListing = async (req, res, next) => {
  try {
    const count = await Listing.countDocuments({ ownerId: req.user.id });
    if (count >= MAX_LISTINGS_PER_OWNER) {
      throw new ApiError(400, `You can list up to ${MAX_LISTINGS_PER_OWNER} businesses. Contact us to list more.`);
    }
    const listing = await Listing.create({ ...pickEditable(req.body), ownerId: req.user.id, status: 'pending' });
    logger.info('Listing submitted', { listingId: String(listing._id), type: listing.type, city: listing.city });
    notifications.notifyAdminsNewListing(listing);
    res.status(201).json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const listMyListings = async (req, res, next) => {
  try {
    const listings = await Listing.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: listings.map(presentOwnListing) });
  } catch (error) {
    next(error);
  }
};

const getMyListing = async (req, res, next) => {
  try {
    res.json({ success: true, data: presentOwnListing(await loadOwned(req)) });
  } catch (error) {
    next(error);
  }
};

const updateListing = async (req, res, next) => {
  try {
    const listing = await loadOwned(req);
    Object.assign(listing, pickEditable(req.body));
    // Edits by owners go back through review so public content stays moderated
    if (req.user.role !== 'admin' && listing.status !== 'paused') {
      listing.status = 'pending';
      listing.rejectionReason = undefined;
    }
    await listing.save();
    res.json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const setPaused = async (req, res, next) => {
  try {
    const listing = await loadOwned(req);
    const paused = Boolean(req.body.paused);
    if (paused) {
      listing.status = 'paused';
    } else if (listing.status === 'paused') {
      listing.status = 'pending'; // re-review before going live again
    }
    await listing.save();
    res.json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const deleteListing = async (req, res, next) => {
  try {
    const listing = await loadOwned(req);
    await ListingPhoto.deleteMany({ listingId: listing._id });
    await listing.deleteOne();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------- photos

const detectImageType = (buffer) => {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length > 12 && buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
};

const uploadPhoto = async (req, res, next) => {
  try {
    const listing = await loadOwned(req);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ApiError(400, 'Send the image as the request body');
    // Trust the file's bytes, not the declared Content-Type
    const contentType = detectImageType(req.body);
    if (!contentType) throw new ApiError(400, 'Only JPEG, PNG or WebP images are allowed');
    if (listing.photoIds.length >= MAX_PHOTOS) throw new ApiError(400, `Up to ${MAX_PHOTOS} photos per listing`);

    const photo = await ListingPhoto.create({
      listingId: listing._id,
      ownerId: listing.ownerId,
      contentType,
      data: req.body,
      size: req.body.length
    });
    listing.photoIds.push(photo._id);
    await listing.save();
    res.status(201).json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const deletePhoto = async (req, res, next) => {
  try {
    const listing = await loadOwned(req);
    const { photoId } = req.params;
    listing.photoIds = listing.photoIds.filter((id) => String(id) !== photoId);
    await listing.save();
    await ListingPhoto.deleteOne({ _id: photoId, listingId: listing._id });
    res.json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const getPhoto = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).end();
    const photo = await ListingPhoto.findById(req.params.id).lean();
    if (!photo) return res.status(404).end();
    res.set({
      'Content-Type': photo.contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(photo.data.buffer ? Buffer.from(photo.data.buffer) : photo.data);
  } catch (error) {
    return next(error);
  }
};

// ---------------------------------------------------------------- public

const getPublicListing = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) throw new ApiError(404, 'Listing not found');
    const listing = await Listing.findOneAndUpdate(
      { _id: req.params.id, status: 'approved' },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!listing) throw new ApiError(404, 'Listing not found');
    res.json({ success: true, data: presentListing(listing) });
  } catch (error) {
    next(error);
  }
};

const searchPublicListings = async (req, res, next) => {
  try {
    const filter = { status: 'approved' };
    if (req.query.city) filter.cityKey = normaliseKey(req.query.city);
    if (req.query.type) filter.type = req.query.type;
    const listings = await Listing.find(filter).sort({ featured: -1, updatedAt: -1 }).limit(50);
    res.json({ success: true, data: listings.map((listing) => presentListing(listing)) });
  } catch (error) {
    next(error);
  }
};

/** Record a lead (WhatsApp/call/website tap). Never blocks the user's tap. */
const recordLead = async (req, res) => {
  try {
    if (isValidId(req.params.id)) {
      const listing = await Listing.findOneAndUpdate(
        { _id: req.params.id, status: 'approved' },
        { $inc: { leads: 1 } }
      );
      if (listing) {
        await Event.create({
          type: 'lead',
          partner: req.body.channel,
          placement: req.body.placement,
          listingId: listing._id,
          itineraryId: req.body.itineraryId,
          destination: listing.city,
          userId: req.user && req.user.id
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to record lead', { error: error.message });
  }
  res.status(204).end();
};

// ---------------------------------------------------------------- location helpers (listing form)

/** Address suggestions: { data: firstResult, results: [...] } */
const geocodeLookup = async (req, res, next) => {
  try {
    const results = await searchPlaces(String(req.query.q).trim(), { country: req.query.country === 'any' ? null : 'in' });
    if (!results.length) {
      return res.status(404).json({ success: false, message: 'No matching places. Try a landmark or area name with the city.' });
    }
    return res.json({ success: true, data: results[0], results });
  } catch (error) {
    logger.warn('Geocode search failed', { error: error.message });
    return res.status(503).json({ success: false, message: 'Address search is busy. Please try again in a moment.' });
  }
};

/** Readable address for a pin. */
const reverseLookup = async (req, res) => {
  try {
    const place = await reverseGeocode(Number(req.query.lat), Number(req.query.lon));
    if (!place) return res.status(404).json({ success: false, message: 'No address found here' });
    return res.json({ success: true, data: place });
  } catch (error) {
    logger.warn('Reverse geocode failed', { error: error.message });
    return res.status(503).json({ success: false, message: 'Could not look up this address right now' });
  }
};

/** Coordinates from a pasted Google Maps link or "lat, lon" text. */
const locationFromLink = async (req, res) => {
  try {
    const point = await locationFromPaste(req.body.link);
    if (!point) {
      return res.status(422).json({
        success: false,
        message: "We couldn't read a location from that. In Google Maps, open your business, tap Share, then Copy link."
      });
    }
    const place = await reverseGeocode(point.lat, point.lon).catch(() => null);
    return res.json({ success: true, data: { ...(place || {}), lat: point.lat, lon: point.lon, name: point.name || (place && place.name) } });
  } catch (error) {
    const message = /Only Google Maps links/.test(error.message)
      ? 'Please paste a Google Maps link (google.com/maps or maps.app.goo.gl).'
      : "We couldn't open that link. Check it's a Google Maps link and try again.";
    return res.status(422).json({ success: false, message });
  }
};

// ---------------------------------------------------------------- admin

const adminListListings = async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const listings = await Listing.find({ status }).sort({ updatedAt: 1 }).limit(100).lean();
    const owners = await User.find({ _id: { $in: listings.map((l) => l.ownerId) } }).select('name email').lean();
    const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
    res.json({
      success: true,
      data: listings.map((listing) => ({
        ...presentOwnListing(listing),
        owner: ownerById.get(String(listing.ownerId)) || null
      }))
    });
  } catch (error) {
    next(error);
  }
};

const adminReview = (decision) => async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) throw new ApiError(404, 'Listing not found');
    const listing = await Listing.findById(req.params.id);
    if (!listing) throw new ApiError(404, 'Listing not found');

    if (decision === 'approve') {
      listing.status = 'approved';
      listing.rejectionReason = undefined;
    } else if (decision === 'reject') {
      listing.status = 'rejected';
      listing.rejectionReason = req.body.reason;
    } else if (decision === 'feature') {
      listing.featured = Boolean(req.body.featured);
      listing.featuredUntil = req.body.featured && req.body.until ? new Date(req.body.until) : undefined;
    }
    listing.reviewedAt = new Date();
    listing.reviewedBy = req.user.id;
    await listing.save();

    logger.info('Listing reviewed', { listingId: String(listing._id), decision, by: req.user.id });
    if (decision === 'approve') notifications.notifyOwnerApproved(listing);
    if (decision === 'reject') notifications.notifyOwnerRejected(listing);
    res.json({ success: true, data: presentOwnListing(listing) });
  } catch (error) {
    next(error);
  }
};

const adminOverview = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const [byStatus, leads, clicks, plans] = await Promise.all([
      Listing.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Event.aggregate([
        { $match: { type: 'lead', createdAt: { $gte: since } } },
        { $group: { _id: '$partner', count: { $sum: 1 } } }
      ]),
      Event.aggregate([
        { $match: { type: 'outbound_click', createdAt: { $gte: since } } },
        { $group: { _id: '$partner', count: { $sum: 1 } } }
      ]),
      Itinerary.countDocuments({ createdAt: { $gte: since } })
    ]);
    const toMap = (rows) => Object.fromEntries(rows.map((row) => [row._id || 'unknown', row.count]));
    res.json({
      success: true,
      data: {
        listings: toMap(byStatus),
        last30Days: { plans, leads: toMap(leads), outboundClicks: toMap(clicks) }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createListing, listMyListings, getMyListing, updateListing, setPaused, deleteListing,
  uploadPhoto, deletePhoto, getPhoto,
  getPublicListing, searchPublicListings, recordLead, geocodeLookup, reverseLookup, locationFromLink,
  adminListListings, adminReview, adminOverview,
  detectImageType
};
