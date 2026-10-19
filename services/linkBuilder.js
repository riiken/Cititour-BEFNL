/**
 * Deterministic outbound links.
 *
 * Links shown to users are never taken from LLM output. They are built here
 * from place names and dates, and carry affiliate parameters when the
 * corresponding partner ID is configured (BOOKING_AFFILIATE_ID, GYG_PARTNER_ID).
 * Without partner IDs the links still work, just without attribution.
 */

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));

const mapsSearchLink = (name, city) => {
  const query = [clean(name), clean(city)].filter(Boolean).join(', ');
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

/**
 * Booking.com search link for a hotel (or a city when no hotel name is given).
 */
const hotelBookingLink = ({ name, city, checkIn, checkOut, adults } = {}) => {
  const search = [clean(name), clean(city)].filter(Boolean).join(', ');
  if (!search) return null;

  const params = new URLSearchParams({ ss: search });
  if (isIsoDate(checkIn)) params.set('checkin', clean(checkIn));
  if (isIsoDate(checkOut)) params.set('checkout', clean(checkOut));
  if (Number.isInteger(adults) && adults > 0) params.set('group_adults', String(adults));
  if (process.env.BOOKING_AFFILIATE_ID) params.set('aid', process.env.BOOKING_AFFILIATE_ID);
  if (process.env.BOOKING_AFFILIATE_LABEL) params.set('label', process.env.BOOKING_AFFILIATE_LABEL);

  return `https://www.booking.com/searchresults.html?${params.toString()}`;
};

/**
 * GetYourGuide search link for activities/tours in a city.
 */
const activityBookingLink = ({ name, city } = {}) => {
  const query = [clean(name), clean(city)].filter(Boolean).join(' ');
  if (!query) return null;

  const params = new URLSearchParams({ q: query });
  if (process.env.GYG_PARTNER_ID) {
    params.set('partner_id', process.env.GYG_PARTNER_ID);
    params.set('utm_medium', 'online_publisher');
  }

  return `https://www.getyourguide.com/s/?${params.toString()}`;
};

const affiliateStatus = () => ({
  booking: Boolean(process.env.BOOKING_AFFILIATE_ID),
  getYourGuide: Boolean(process.env.GYG_PARTNER_ID)
});

module.exports = {
  mapsSearchLink,
  hotelBookingLink,
  activityBookingLink,
  affiliateStatus
};
