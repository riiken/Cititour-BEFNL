const { politeGet } = require('../config/http');
const logger = require('../config/logger');

/**
 * Wikivoyage travel-guide listings (CC BY-SA 4.0; attribution shown in the UI).
 *
 * City articles contain structured listing templates:
 *   {{see | name=... | lat=... | long=... | content=...}}
 *   {{sleep | name=... | price=... | address=...}}
 * We extract see/do (attractions), eat/drink (restaurants) and sleep (hotels).
 * Region articles (e.g. "Goa") mostly link to city articles, so we follow the
 * first few links in their "Cities" section.
 */

const API_URL = 'https://en.wikivoyage.org/w/api.php';
const LISTING_TYPES = ['see', 'do', 'eat', 'drink', 'sleep', 'listing'];
const MAX_REGION_CITIES = 5;
const MIN_USEFUL_LISTINGS = 8;
const MAX_GUIDES = 10;           // articles fetched per destination (region + towns)
const FETCH_CONCURRENCY = 4;      // be polite to Wikimedia

// ---------------------------------------------------------------------------
// Wikitext parsing
// ---------------------------------------------------------------------------

/**
 * Find each top-level {{type | ...}} listing template and return its raw
 * argument text. Handles nested {{...}} and [[...]] correctly.
 */
const extractTemplates = (wikitext) => {
  const templates = [];
  const pattern = new RegExp(`\\{\\{\\s*(${LISTING_TYPES.join('|')})\\s*\\|`, 'gi');
  let match;
  while ((match = pattern.exec(wikitext))) {
    const start = match.index;
    let depth = 0;
    let end = -1;
    for (let i = start; i < wikitext.length - 1; i++) {
      const pair = wikitext.slice(i, i + 2);
      if (pair === '{{') { depth++; i++; continue; }
      if (pair === '}}') {
        depth--;
        i++;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) break;
    templates.push({ type: match[1].toLowerCase(), body: wikitext.slice(match.index + match[0].length, end - 2) });
    pattern.lastIndex = end;
  }
  return templates;
};

/** Split template arguments on top-level pipes only. */
const splitArgs = (body) => {
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2);
    if (pair === '{{' || pair === '[[') { depth++; current += pair; i++; continue; }
    if (pair === '}}' || pair === ']]') { depth = Math.max(0, depth - 1); current += pair; i++; continue; }
    if (body[i] === '|' && depth === 0) { args.push(current); current = ''; continue; }
    current += body[i];
  }
  args.push(current);

  const fields = {};
  for (const arg of args) {
    const index = arg.indexOf('=');
    if (index > 0) fields[arg.slice(0, index).trim().toLowerCase()] = arg.slice(index + 1).trim();
  }
  return fields;
};

/** Reduce wikitext markup to plain text. */
const plain = (value, max = 300) => String(value || '')
  .replace(/<ref[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')       // [[target|text]] -> text
  .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')         // [url text] -> text
  .replace(/\{\{\s*(?:w|wp|iata|lang)\s*\|(?:[^{}|]*\|)?([^{}|]+)\}\}/gi, '$1') // {{w|Page}} -> Page
  .replace(/\{\{[^{}]*\}\}/g, '')                           // remaining simple templates
  .replace(/'{2,}/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const coordinate = (value) => {
  const number = Number(String(value || '').trim());
  return Number.isFinite(number) && number !== 0 ? number : undefined;
};

/** First amount in a price string, when it is in rupees. */
const parseInrPrice = (price) => {
  const text = String(price || '');
  if (!/₹|rs\.?\s|inr/i.test(text)) return undefined;
  const match = text.replace(/,/g, '').match(/(?:₹|rs\.?|inr)\s*(\d{2,7})/i) || text.replace(/,/g, '').match(/(\d{3,7})/);
  const amount = match ? Number(match[1]) : undefined;
  return amount && amount >= 50 ? amount : undefined;
};

const toListing = ({ type, body }) => {
  const fields = splitArgs(body);
  const name = plain(fields.name, 120);
  if (!name) return null;
  return {
    type,
    name,
    description: plain(fields.content || fields.description, 300),
    area: plain(fields.address || fields.directions, 120),
    lat: coordinate(fields.lat),
    lon: coordinate(fields.long || fields.lon),
    price: plain(fields.price, 80),
    url: /^https?:\/\//.test(fields.url || '') ? fields.url : undefined
  };
};

const sectionLinks = (wikitext, heading) => {
  const section = wikitext.match(new RegExp(`==\\s*${heading}\\s*==([\\s\\S]*?)(?:\\n==[^=]|$)`, 'i'));
  if (!section) return [];
  return [...section[1].matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter((title) => !/^(file|image|category):/i.test(title));
};

/**
 * Sub-destinations of a region article from its "Cities" and "Other
 * destinations" sections.
 */
const regionCityLinks = (wikitext, { highlightsFirst = true } = {}) => {
  // Alternate "Other destinations" (beaches, parks, hill stations - usually
  // the visitor highlights) with "Cities", highlights first
  const cities = sectionLinks(wikitext, 'Cities').slice(0, 8);
  const others = sectionLinks(wikitext, 'Other destinations').slice(0, 8);
  return [...new Set(interleave(highlightsFirst ? [others, cities] : [cities, others]))];
};

/**
 * Highlights listed as map markers in a region's "Other destinations"
 * section (beaches, parks, hill stations), e.g.
 *   * {{marker|type=go|name=[[Anjuna]]|lat=15.58|long=73.74}} &mdash; a town with Anjuna Beach
 * returned as attraction listings with coordinates.
 */
const destinationMarkers = (wikitext) => {
  const section = wikitext.match(/==\s*Other destinations\s*==([\s\S]*?)(?:\n==[^=]|$)/i);
  if (!section) return [];
  const markers = [];
  const pattern = /\{\{\s*marker\s*\|([\s\S]*?)\}\}([^\n]*)/gi;
  let match;
  while ((match = pattern.exec(section[1]))) {
    const fields = splitArgs(match[1]);
    const name = plain(fields.name, 120);
    const lat = coordinate(fields.lat);
    const lon = coordinate(fields.long || fields.lon);
    if (!name || lat === undefined || lon === undefined) continue;
    const description = plain(
      match[2]
        .replace(/&mdash;|&ndash;/g, '—')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/^[\s,;:—–-]+/, '')
        .replace(/^([^—]{0,40})—\s*/, (all, place) => (place.trim() ? `${place.trim()}: ` : '')),
      200
    );
    markers.push({ type: 'see', name, description, lat, lon, highlight: true });
  }
  return markers;
};

/** Region pages carry a status template such as {{usableregion}} or {{outlineregion}}. */
const isRegionArticle = (wikitext) => /\{\{\s*\w*region\s*[|}]/i.test(wikitext);

/** Top-level sub-regions from a {{Regionlist}} (regionNname=[[North Goa]]). */
const regionNames = (wikitext) => [...wikitext.matchAll(/region\d+name\s*=\s*\[\[([^\]|#]+)/gi)]
  .map((match) => match[1].trim());

/**
 * Merge listings from several towns round-robin, so one large town can't
 * crowd out the others (e.g. Panaji vs. Goa's beach towns).
 */
const interleave = (lists) => {
  const result = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (list[i]) result.push(list[i]);
  }
  return result;
};

const mapLimited = async (items, limit, fn) => {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...await Promise.allSettled(items.slice(i, i + limit).map(fn)));
  }
  return results;
};

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const fetchWikitext = async (title) => {
  const response = await politeGet(API_URL, {
    params: { action: 'parse', format: 'json', prop: 'wikitext', redirects: 1, page: title },
    timeout: 8000
  });
  const parse = response.data && response.data.parse;
  if (!parse) return null;
  return { title: parse.title, wikitext: parse.wikitext['*'] };
};

const listingsFrom = (wikitext) => extractTemplates(wikitext).map(toListing).filter(Boolean);

const categorise = (listings, sourceTitle) => {
  const tag = (listing) => ({ ...listing, guide: sourceTitle });
  return {
    attractions: listings.filter((l) => ['see', 'do'].includes(l.type)).map(tag),
    restaurants: listings.filter((l) => ['eat', 'drink'].includes(l.type)).map(tag),
    hotels: listings.filter((l) => l.type === 'sleep').map((l) => ({ ...tag(l), priceMin: parseInrPrice(l.price) }))
  };
};

/**
 * Fetch listings for a destination. Returns null when Wikivoyage has no
 * article for it.
 */
const fetchGuide = async (destination) => {
  const article = await fetchWikitext(destination);
  if (!article) return null;

  const ownListings = listingsFrom(article.wikitext);
  const highlights = destinationMarkers(article.wikitext);
  const guides = [article.title];
  let townLists = [];

  if (ownListings.length < MIN_USEFUL_LISTINGS || isRegionArticle(article.wikitext)) {
    // Region: its main towns, plus the towns of its top sub-regions
    const seen = new Set([article.title.toLowerCase()]);
    const towns = [];
    const addTown = (title) => {
      const key = title.toLowerCase();
      if (!seen.has(key) && towns.length < MAX_GUIDES - 1) {
        seen.add(key);
        towns.push(title);
      }
    };
    // The region's own major cities first; its sub-regions contribute highlights
    regionCityLinks(article.wikitext, { highlightsFirst: false }).slice(0, 3).forEach(addTown);

    const subRegions = regionNames(article.wikitext).slice(0, 3).filter((title) => !seen.has(title.toLowerCase()));
    const subResults = await mapLimited(subRegions, FETCH_CONCURRENCY, fetchWikitext);
    for (const result of subResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      seen.add(result.value.title.toLowerCase());
      guides.push(result.value.title);
      townLists.push(listingsFrom(result.value.wikitext).map((l) => ({ ...l, region: result.value.title })));
      highlights.push(...destinationMarkers(result.value.wikitext).map((l) => ({ ...l, region: result.value.title })));
      // Up to 3 towns per sub-region that aren't already included
      let added = 0;
      for (const title of regionCityLinks(result.value.wikitext)) {
        if (added >= 3) break;
        const before = towns.length;
        addTown(title);
        if (towns.length > before) added++;
      }
    }

    const townResults = await mapLimited(towns, FETCH_CONCURRENCY, fetchWikitext);
    for (const result of townResults) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      guides.push(result.value.title);
      townLists.push(listingsFrom(result.value.wikitext).map((l) => ({ ...l, region: result.value.title })));
    }
  }

  // Highlights (beaches, parks...) and the destination's own listings first,
  // then towns interleaved
  const uniqueHighlights = highlights.filter((h, i) => highlights.findIndex((o) => o.name === h.name) === i);
  const listings = [...uniqueHighlights, ...ownListings, ...interleave(townLists.filter((list) => list.length))];
  const sections = categorise(listings, article.title);
  logger.info('Wikivoyage guide loaded', {
    destination,
    guides: guides.length,
    attractions: sections.attractions.length,
    restaurants: sections.restaurants.length,
    hotels: sections.hotels.length
  });

  return {
    title: article.title,
    url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
    towns: guides.slice(1),
    ...sections
  };
};

module.exports = { fetchGuide, destinationMarkers, extractTemplates, splitArgs, plain, parseInrPrice, regionCityLinks, regionNames, isRegionArticle, interleave, toListing };
