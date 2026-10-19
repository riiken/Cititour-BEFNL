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
 * Sub-destinations of a region article: a few from "Cities" plus a few from
 * "Other destinations" (where beaches, parks and hill stations are listed).
 */
const regionCityLinks = (wikitext) => {
  const cities = sectionLinks(wikitext, 'Cities').slice(0, 3);
  const others = sectionLinks(wikitext, 'Other destinations').slice(0, 3);
  return [...new Set([...cities, ...others])].slice(0, MAX_REGION_CITIES + 1);
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

  let listings = listingsFrom(article.wikitext);
  const guides = [article.title];

  if (listings.length < MIN_USEFUL_LISTINGS) {
    const cities = regionCityLinks(article.wikitext);
    const results = await Promise.allSettled(cities.map(fetchWikitext));
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        listings = listings.concat(listingsFrom(result.value.wikitext).map((l) => ({ ...l, region: result.value.title })));
        guides.push(result.value.title);
      }
    }
  }

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
    ...sections
  };
};

module.exports = { fetchGuide, extractTemplates, splitArgs, plain, parseInrPrice, regionCityLinks, toListing };
