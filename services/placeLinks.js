const { mapsSearchLink, hotelBookingLink, activityBookingLink } = require('./linkBuilder');
const { contactLinks } = require('./listingService');

/**
 * Public links for a place (built at response time, never stored):
 *  - owner-listed businesses: WhatsApp / call / website (direct leads)
 *  - hotels and stay areas: Booking.com search with dates and guests
 *  - attractions and tours: GetYourGuide search
 *  - everything: Google Maps
 * Raw contact fields are removed from the output.
 *
 * @param {Object} place - place snapshot (kind, name, lat, lon, partner, contact, ...)
 * @param {{city:string, checkIn?:string, checkOut?:string, travellers?:number}} context
 */
const withPlaceLinks = (place, { city, checkIn, checkOut, travellers } = {}) => {
  if (!place) return place;
  const adults = Number.isInteger(travellers) ? travellers : undefined;

  if (place.partner) {
    const { contact, ...publicPlace } = place;
    const links = contactLinks({ name: place.name, contact }, { checkIn, checkOut, travellers });
    return {
      ...publicPlace,
      ...links,
      mapsLink: Number.isFinite(place.lat)
        ? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`
        : mapsSearchLink(place.name, city),
      bookingLink: links.websiteLink || undefined
    };
  }

  const { contact, ...publicPlace } = place;
  const links = { mapsLink: mapsSearchLink(place.kind === 'area' ? place.area : place.name, city) };
  if (place.kind === 'attraction' || place.kind === 'tour') {
    links.bookingLink = activityBookingLink({ name: place.name, city });
  }
  if (place.kind === 'hotel' || place.kind === 'area') {
    links.bookingLink = hotelBookingLink({
      // Areas search by their landmark ("Lake Pichola, Udaipur")
      name: place.kind === 'area' ? place.area : place.name,
      city, checkIn, checkOut, adults
    });
  }
  return { ...publicPlace, ...links };
};

module.exports = { withPlaceLinks };
