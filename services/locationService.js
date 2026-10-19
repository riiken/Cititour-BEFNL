const axios = require('axios');
const { politeGet } = require('../config/http');
const { createTtlCache } = require('../utils/ttlCache');

/**
 * Location helpers for the business listing form:
 *  - address search with suggestions (OpenStreetMap Nominatim)
 *  - reverse geocoding (coordinates -> readable address)
 *  - Google Maps share links -> coordinates (without fetching page content)
 *
 * Nominatim's usage policy allows at most 1 request/second, so all calls are
 * serialised through a small throttle and cached.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const MIN_GAP_MS = 1100;

let queue = Promise.resolve();
let lastCall = 0;
const throttled = (fn) => {
  const run = queue.then(async () => {
    const waitMs = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastCall = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
};

const searchCache = createTtlCache({ ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 5000 });
const reverseCache = createTtlCache({ ttlMs: 30 * 24 * 60 * 60 * 1000, maxEntries: 5000 });

const pick = (address, keys) => keys.map((key) => address && address[key]).find(Boolean);

/** Short, human address parts from a Nominatim result. */
const describe = (result) => {
  const address = result.address || {};
  const city = pick(address, ['city', 'town', 'village', 'municipality', 'county', 'state_district']);
  const area = pick(address, ['neighbourhood', 'suburb', 'quarter', 'hamlet', 'road']);
  const name = result.name || pick(address, ['amenity', 'tourism', 'shop', 'building']);
  return {
    lat: Number(result.lat),
    lon: Number(result.lon),
    name: name || undefined,
    area: area || undefined,
    city: city || undefined,
    state: address.state,
    displayName: result.display_name
  };
};

/**
 * Address suggestions. Results in India first when `country` is 'in'.
 */
const searchPlaces = (query, { country = 'in', limit = 5 } = {}) =>
  searchCache.wrap(`${country}|${query.toLowerCase().trim()}`, () =>
    throttled(async () => {
      const response = await politeGet(`${NOMINATIM}/search`, {
        params: { q: query, format: 'jsonv2', addressdetails: 1, limit, ...(country && { countrycodes: country }) },
        headers: { 'Accept-Language': 'en' }
      });
      return (response.data || []).map(describe);
    }));

/** Readable address for a point (rounded to ~10 m for caching). */
const reverseGeocode = (lat, lon) => {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return reverseCache.wrap(key, () =>
    throttled(async () => {
      const response = await politeGet(`${NOMINATIM}/reverse`, {
        params: { lat, lon, format: 'jsonv2', addressdetails: 1, zoom: 18 },
        headers: { 'Accept-Language': 'en' }
      });
      if (!response.data || response.data.error) return null;
      return describe(response.data);
    }));
};

// ---------------------------------------------------------------------------
// Google Maps links
// ---------------------------------------------------------------------------

// Only Google Maps hosts are ever requested (prevents using this as a proxy).
const ALLOWED_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.(com|co\.in|[a-z]{2,3}(\.[a-z]{2})?)|consent\.google\.com)$/i;
const MAX_REDIRECTS = 5;

const validCoords = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

/**
 * Coordinates from a Google Maps URL, preferring the place's own position
 * (!3d..!4d..) over the viewport (@lat,lon).
 */
const coordsFromUrl = (rawUrl) => {
  const url = decodeURIComponent(String(rawUrl));
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                         // place pin
    /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // ?q=lat,lon
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                               // viewport centre
    /\/(-?\d+\.\d+),\s*(-?\d+\.\d+)(?:[/?]|$)/                   // /search/lat,lon
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      if (validCoords(lat, lon)) return { lat, lon };
    }
  }
  return null;
};

/** Place name from /maps/place/<Name>/... or ?q=<Name>, used when no coordinates are present. */
const placeNameFromUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
    if (place) return decodeURIComponent(place[1].replace(/\+/g, ' '));
    const q = url.searchParams.get('q') || url.searchParams.get('query');
    return q && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q) ? q : null;
  } catch {
    return null;
  }
};

/**
 * Follow a share link's redirects (only to allowed Google hosts, without
 * downloading page bodies) and return the final URL.
 */
const resolveShortLink = async (startUrl) => {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.test(url.hostname)) {
      throw new Error('Only Google Maps links are supported');
    }
    // consent.google.com wraps the real destination in ?continue=
    if (/^consent\.google\.com$/i.test(url.hostname) && url.searchParams.get('continue')) {
      current = url.searchParams.get('continue');
      continue;
    }
    if (coordsFromUrl(current) || hop === MAX_REDIRECTS) return current;

    const response = await axios.head(current, {
      maxRedirects: 0,
      timeout: 6000,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitiTour/1.0)' }
    }).catch((error) => {
      // Some endpoints reject HEAD; retry the hop with GET but don't read the body
      if (error.response && error.response.status === 405) {
        return axios.get(current, { maxRedirects: 0, timeout: 6000, responseType: 'stream', validateStatus: (s) => s < 400 })
          .then((res) => { res.data.destroy(); return res; });
      }
      throw error;
    });

    const location = response.headers && response.headers.location;
    if (!location || response.status < 300) return current;
    current = new URL(location, current).toString();
  }
  return current;
};

/**
 * Turn whatever the owner pasted into a point:
 *   "30.1296, 78.3254" | google.com/maps/... | maps.app.goo.gl/... | goo.gl/maps/...
 * @returns {Promise<{lat:number, lon:number, name?:string}|null>}
 */
const locationFromPaste = async (input) => {
  const text = String(input || '').trim();

  const plain = text.match(/^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/);
  if (plain) {
    const lat = Number(plain[1]);
    const lon = Number(plain[2]);
    return validCoords(lat, lon) ? { lat, lon } : null;
  }

  const urlMatch = text.match(/https?:\/\/\S+/);
  if (!urlMatch) return null;

  const finalUrl = await resolveShortLink(urlMatch[0]);
  const coords = coordsFromUrl(finalUrl);
  const name = placeNameFromUrl(finalUrl) || undefined;
  if (coords) return { ...coords, name };
  if (name) {
    const [first] = await searchPlaces(name, { country: null, limit: 1 });
    return first ? { lat: first.lat, lon: first.lon, name } : null;
  }
  return null;
};

module.exports = { searchPlaces, reverseGeocode, locationFromPaste, coordsFromUrl, placeNameFromUrl, resolveShortLink, ALLOWED_HOSTS };
