/**
 * Trip extras built with plain rules (no AI): calendar export and a packing
 * checklist derived from the trip's own places, dates and destination.
 */

// ---------------------------------------------------------------------------
// Calendar (.ics)
// ---------------------------------------------------------------------------

// Local times for each slot (India Standard Time)
const SLOT_TIMES = {
  morning: ['09:00', '12:00'],
  lunch: ['13:00', '14:00'],
  afternoon: ['14:30', '17:30'],
  evening: ['18:00', '20:00'],
  dinner: ['20:00', '21:30']
};

const escapeText = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets as required by RFC 5545. */
const fold = (line) => {
  const parts = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
};

const compactDate = (isoDate) => isoDate.replace(/-/g, '');
const localStamp = (isoDate, time) => `${compactDate(isoDate)}T${time.replace(':', '')}00`;
const utcNow = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * @param {Object} itinerary - Itinerary document/JSON
 * @param {string} tripUrl - link back to the trip page
 * @returns {string} iCalendar text
 */
const buildIcs = (itinerary, tripUrl) => {
  const city = (itinerary.destination && itinerary.destination.name) || itinerary.request.destination;
  const stamp = utcNow();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CitiTour//Trip planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(itinerary.title)}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  const event = ({ uid, start, end, allDay, summary, location, description }) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@cititour`, `DTSTAMP:${stamp}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(start)}`, `DTEND;VALUE=DATE:${compactDate(end)}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Kolkata:${start}`, `DTEND;TZID=Asia/Kolkata:${end}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (tripUrl) lines.push(`URL:${tripUrl}`);
    lines.push('END:VEVENT');
  };

  // The whole trip as an all-day event, with the stays in the description
  const stays = (itinerary.stays || []).map((stay) => stay.place && stay.place.name).filter(Boolean);
  event({
    uid: `${itinerary.id || itinerary.publicId}-trip`,
    allDay: true,
    start: itinerary.request.checkIn,
    end: addDays(itinerary.request.checkOut, 1),
    summary: `Trip: ${itinerary.title}`,
    location: city,
    description: [itinerary.summary, stays.length ? `Stay options: ${stays.join(', ')}` : '', tripUrl].filter(Boolean).join('\n\n')
  });

  for (const day of itinerary.days || []) {
    (day.items || []).forEach((item, index) => {
      const [from, to] = SLOT_TIMES[item.slot] || SLOT_TIMES.morning;
      const place = item.place || {};
      event({
        uid: `${itinerary.id || itinerary.publicId}-d${day.day}-${index}`,
        start: localStamp(day.date, from),
        end: localStamp(day.date, to),
        summary: `${place.kind === 'restaurant' ? '🍽 ' : ''}${place.name}`,
        location: [place.name, place.area, city].filter(Boolean).join(', '),
        description: [item.note || place.description, place.mapsLink].filter(Boolean).join('\n')
      });
    });
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
};

// ---------------------------------------------------------------------------
// Packing checklist
// ---------------------------------------------------------------------------

const ESSENTIALS = [
  { item: 'ID proof (Aadhaar / passport / driving licence)', category: 'Documents', reason: 'Needed at hotels, airports and many monuments' },
  { item: 'Tickets and booking confirmations (offline copies)', category: 'Documents', reason: 'Signal can be patchy' },
  { item: 'Phone charger and power bank', category: 'Essentials', reason: 'Maps and tickets drain the battery' },
  { item: 'Some cash plus UPI on your phone', category: 'Essentials', reason: 'Small shops and autos may not take cards' },
  { item: 'Personal medicines and a basic first-aid kit', category: 'Health', reason: 'Including anything for stomach upsets and headaches' },
  { item: 'Reusable water bottle', category: 'Health', reason: 'Stay hydrated while sightseeing' },
  { item: 'Comfortable walking shoes', category: 'Clothing', reason: 'Most plans involve a lot of walking' }
];

const RULES = [
  {
    match: /\b(temple|mandir|gurudwara|mosque|dargah|church|cathedral|basilica|ashram|monastery|ghat)\b/i,
    items: [
      { item: 'Clothes covering shoulders and knees', category: 'Clothing', reason: 'Expected at religious sites on your plan' },
      { item: 'Socks (for shoe-free areas)', category: 'Clothing', reason: 'Shoes are removed at temples; floors get hot' },
      { item: 'Scarf or stole', category: 'Clothing', reason: 'Some places ask you to cover your head' }
    ]
  },
  {
    match: /\b(beach|island|coast|sea|bay|lagoon)\b/i,
    items: [
      { item: 'Swimwear and a quick-dry towel', category: 'Clothing', reason: 'Beach time on your plan' },
      { item: 'Sunscreen (SPF 30+), sunglasses and a hat', category: 'Health', reason: 'Strong sun by the sea' },
      { item: 'Flip-flops', category: 'Clothing', reason: 'For beaches and wet areas' }
    ]
  },
  {
    match: /\b(trek|hill|peak|valley|pass|falls|waterfall|forest|sanctuary|national park|reserve|cave)\b/i,
    items: [
      { item: 'Shoes with good grip', category: 'Clothing', reason: 'Trails, hills or waterfalls on your plan' },
      { item: 'Insect repellent', category: 'Health', reason: 'Forests and water attract mosquitoes' },
      { item: 'Light backpack', category: 'Essentials', reason: 'For water and snacks on longer outings' }
    ]
  },
  {
    match: /\b(rafting|kayak|water sports|boat|cruise)\b/i,
    items: [
      { item: 'Quick-dry clothes and a change of clothes', category: 'Clothing', reason: 'Water activities on your plan' },
      { item: 'Waterproof phone pouch', category: 'Essentials', reason: 'Keep your phone dry on the water' }
    ]
  }
];

// Rough regional climate for India by state/region keywords
const COLD_REGIONS = /\b(himachal|uttarakhand|kashmir|ladakh|sikkim|arunachal|darjeeling|meghalaya|manali|shimla|mussoorie|nainital|leh|gulmarg|ooty|munnar|kodaikanal)\b/i;

const monthOf = (isoDate) => Number(String(isoDate).slice(5, 7));

/**
 * @param {Object} itinerary
 * @returns {{category: string, item: string, reason: string}[]}
 */
const buildPackingList = (itinerary) => {
  const items = [...ESSENTIALS];
  const add = (entry) => { if (!items.some((existing) => existing.item === entry.item)) items.push(entry); };

  const text = [
    itinerary.destination && itinerary.destination.displayName,
    ...(itinerary.days || []).flatMap((day) => (day.items || []).map((item) => item.place && `${item.place.name} ${item.place.description || ''}`))
  ].filter(Boolean).join(' ');

  for (const rule of RULES) {
    if (rule.match.test(text)) rule.items.forEach(add);
  }

  const months = new Set([monthOf(itinerary.request.checkIn), monthOf(itinerary.request.checkOut)]);
  const location = `${itinerary.destination && itinerary.destination.displayName} ${itinerary.request.destination}`;
  const cold = COLD_REGIONS.test(location);

  if ([6, 7, 8, 9].some((m) => months.has(m))) {
    add({ item: 'Umbrella or rain jacket', category: 'Clothing', reason: 'Monsoon season (June–September)' });
    add({ item: 'Waterproof bag for electronics', category: 'Essentials', reason: 'Sudden heavy showers in the monsoon' });
  }
  if (cold && [11, 12, 1, 2, 3].some((m) => months.has(m))) {
    add({ item: 'Warm jacket, thermals, gloves and a woollen cap', category: 'Clothing', reason: 'Hill destinations are cold in winter' });
    add({ item: 'Moisturiser and lip balm', category: 'Health', reason: 'Cold, dry mountain air' });
  } else if (cold) {
    add({ item: 'Light jacket or fleece', category: 'Clothing', reason: 'Hill evenings get cool even in summer' });
  } else if ([4, 5, 6].some((m) => months.has(m))) {
    add({ item: 'Cotton clothes, cap and sunscreen', category: 'Clothing', reason: 'Indian summers are hot (April–June)' });
    add({ item: 'ORS sachets', category: 'Health', reason: 'Helps with dehydration in the heat' });
  }

  if ((itinerary.request.travellers || 1) >= 4) {
    add({ item: 'Split-expense app or shared notes for the group', category: 'Essentials', reason: 'Easier to settle costs later' });
  }

  const order = ['Documents', 'Essentials', 'Clothing', 'Health'];
  return items.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
};

module.exports = { buildIcs, buildPackingList, SLOT_TIMES };
