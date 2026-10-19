const Listing = require('../model/Listing');

/**
 * Normalise a phone number to international digits (no '+').
 * Indian 10-digit mobiles get the 91 country code.
 * Returns null when the value cannot be a phone number.
 */
const normalisePhone = (value) => {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

const safeUrl = (value) => (/^https?:\/\/[^\s]+$/i.test(String(value || '')) ? String(value) : null);

/**
 * Contact links for a listing. WhatsApp opens with a message that tells the
 * business the lead came from CitiTour (useful when charging per lead).
 */
const contactLinks = (listing, { checkIn, checkOut, travellers } = {}) => {
  const contact = listing.contact || {};
  const whatsapp = normalisePhone(contact.whatsapp || contact.phone);
  const phone = normalisePhone(contact.phone || contact.whatsapp);

  let message = `Hi, I found ${listing.name} on CitiTour`;
  if (checkIn && checkOut) message += ` and I'm planning a visit from ${checkIn} to ${checkOut}`;
  if (travellers) message += ` for ${travellers} ${travellers === 1 ? 'person' : 'people'}`;
  message += '. Could you share availability and prices?';

  return {
    whatsappLink: whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : null,
    callLink: phone ? `tel:+${phone}` : null,
    websiteLink: safeUrl(contact.bookingUrl) || safeUrl(contact.website),
    email: contact.email || null
  };
};

const photoUrl = (photoId) => `/api/v1/photos/${photoId}`;

/** Public representation (no owner details, moderation notes or raw contact fields). */
const presentListing = (listing, tripContext) => {
  const data = typeof listing.toObject === 'function' ? listing.toObject() : listing;
  const [lon, lat] = (data.location && data.location.coordinates) || [];
  return {
    id: String(data._id),
    type: data.type,
    subtype: data.subtype,
    name: data.name,
    description: data.description,
    city: data.city,
    address: data.address,
    lat,
    lon,
    priceMin: data.priceMin,
    priceMax: data.priceMax,
    priceUnit: data.priceUnit,
    amenities: data.amenities,
    cuisines: data.cuisines,
    vegOnly: data.vegOnly,
    duration: data.duration,
    openingHours: data.openingHours,
    photos: (data.photoIds || []).map(photoUrl),
    verified: data.status === 'approved',
    sponsored: Boolean(data.featured && (!data.featuredUntil || new Date(data.featuredUntil) > new Date())),
    ...contactLinks(data, tripContext)
  };
};

/** Owner/admin representation: everything, including moderation state. */
const presentOwnListing = (listing) => {
  const data = typeof listing.toObject === 'function' ? listing.toObject() : listing;
  const [lon, lat] = (data.location && data.location.coordinates) || [];
  return {
    ...presentListing(data),
    contact: data.contact,
    status: data.status,
    rejectionReason: data.rejectionReason,
    featured: data.featured,
    featuredUntil: data.featuredUntil,
    views: data.views,
    leads: data.leads,
    lat,
    lon,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

/**
 * Approved listings near a destination, for trip planning.
 * @param {{lat:number, lon:number}} centre
 * @param {number} radiusKm
 */
const findApprovedNear = async (centre, radiusKm = 30, limit = 40) => {
  if (!Number.isFinite(centre.lat) || !Number.isFinite(centre.lon)) return [];
  return Listing.find({
    status: 'approved',
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [centre.lon, centre.lat] },
        $maxDistance: radiusKm * 1000
      }
    }
  }).limit(limit).lean();
};

module.exports = { normalisePhone, contactLinks, presentListing, presentOwnListing, findApprovedNear, photoUrl, safeUrl };
