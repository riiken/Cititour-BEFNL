jest.mock('../services/destinationDataService', () => {
  const actual = jest.requireActual('../services/destinationDataService');
  return { ...actual, getDestination: jest.fn() };
});
jest.mock('../services/listingsService', () => ({ getCityListings: jest.fn().mockResolvedValue({ place: null }) }));
jest.mock('../config/gemini', () => ({ generateTravelRecommendation: jest.fn(), generateQuickSuggestion: jest.fn() }));
jest.mock('../config/groq', () => ({ generateGroqRecommendation: jest.fn(), generateGroqQuickSuggestion: jest.fn() }));

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const { getDestination } = require('../services/destinationDataService');
const gemini = require('../config/gemini');
const groq = require('../config/groq');
const Event = require('../model/Event');

const city = {
  name: 'Udaipur', displayName: 'Udaipur, Rajasthan, India', lat: 24.58, lon: 73.68,
  guide: { title: 'Udaipur', url: 'https://en.wikivoyage.org/wiki/Udaipur' },
  attractions: [
    { name: 'City Palace', lat: 24.576, lon: 73.683, source: 'wikivoyage' },
    { name: 'Jagdish Temple', lat: 24.579, lon: 73.684, source: 'wikivoyage' },
    { name: 'Fateh Sagar Lake', lat: 24.601, lon: 73.675, source: 'wikipedia' },
    { name: 'Saheliyon ki Bari', lat: 24.603, lon: 73.687, source: 'wikivoyage' }
  ],
  hotels: [{ name: 'Poonam Haveli', priceMin: 2000 }],
  restaurants: [{ name: 'Ambrai' }]
};

const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const body = { destination: 'Udaipur', checkIn: isoIn(30), checkOut: isoIn(32), travellers: 2, budget: 'Mid-range', interests: ['Culture'] };

beforeAll(db.connect);
beforeEach(() => getDestination.mockResolvedValue(city));
afterEach(async () => { await db.clear(); jest.clearAllMocks(); delete process.env.AI_ENABLED; });
afterAll(db.close);

describe('POST /api/v1/itineraries', () => {
  it('creates a grounded plan; invented places are dropped', async () => {
    gemini.generateTravelRecommendation.mockResolvedValue(JSON.stringify({
      title: 'Royal Udaipur',
      days: [
        { day: 1, theme: 'Arrival', items: [{ id: 'A1', slot: 'afternoon', note: 'Go early' }, { id: 'A42', slot: 'evening', note: 'invented' }] },
        { day: 2, theme: 'Lakes', items: [{ id: 'A3', slot: 'morning' }, { id: 'R1', slot: 'lunch' }] },
        { day: 3, theme: 'Bye', items: [{ id: 'A4', slot: 'morning' }] }
      ],
      stays: [{ id: 'H1', note: 'Central' }],
      budget: { total: '₹20,000 - ₹30,000' },
      tips: ['Book boat rides early']
    }));

    const res = await request(app).post('/api/v1/itineraries').send(body);

    expect(res.status).toBe(201);
    const plan = res.body.data;
    expect(plan.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(plan.title).toBe('Royal Udaipur');
    expect(plan.generatedBy).toBe('ai');
    const names = plan.days.flatMap((d) => d.items.map((i) => i.place.name));
    expect(names).toContain('City Palace');
    expect(JSON.stringify(plan)).not.toContain('invented');
    expect(plan.stays[0].place.bookingLink).toContain('booking.com');
    expect(plan.stays[0].place.bookingLink).toContain('group_adults=2');
    expect(plan.links.allStays).toContain(`checkin=${body.checkIn}`);
    expect(plan.sources).toContain('Wikivoyage');
  });

  it('still returns a plan when every AI provider fails', async () => {
    gemini.generateTravelRecommendation.mockRejectedValue(new Error('down'));
    groq.generateGroqRecommendation.mockRejectedValue(new Error('down'));

    const res = await request(app).post('/api/v1/itineraries').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.generatedBy).toBe('rules');
    expect(res.body.data.days[1].items.length).toBeGreaterThan(0);
    expect(res.body.data.stays[0].place.name).toBe('Poonam Haveli');
  });

  it('skips AI when the kill-switch is on', async () => {
    process.env.AI_ENABLED = 'false';
    const res = await request(app).post('/api/v1/itineraries').send(body);
    expect(res.status).toBe(201);
    expect(gemini.generateTravelRecommendation).not.toHaveBeenCalled();
  });

  it('reuses a recent identical plan', async () => {
    process.env.AI_ENABLED = 'false';
    const first = await request(app).post('/api/v1/itineraries').send(body);
    const second = await request(app).post('/api/v1/itineraries').send(body);
    expect(second.body.reused).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(getDestination).toHaveBeenCalledTimes(1);
  });

  it('404s for unknown destinations', async () => {
    getDestination.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/itineraries').send({ ...body, destination: 'Atlantis' });
    expect(res.status).toBe(404);
  });

  it('validates dates', async () => {
    const res = await request(app).post('/api/v1/itineraries').send({ ...body, checkOut: isoIn(29) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/itineraries/:id', () => {
  it('returns a shared plan and counts views', async () => {
    process.env.AI_ENABLED = 'false';
    const created = await request(app).post('/api/v1/itineraries').send(body);
    const res = await request(app).get(`/api/v1/itineraries/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.destination.name).toBe('Udaipur');
  });

  it('404s for unknown ids', async () => {
    expect((await request(app).get('/api/v1/itineraries/doesnotexist1')).status).toBe(404);
  });
});

describe('POST /api/v1/events', () => {
  it('records outbound clicks', async () => {
    const res = await request(app).post('/api/v1/events')
      .send({ type: 'outbound_click', partner: 'booking', placement: 'itinerary_stay', itineraryId: 'abc123DEF456' });
    expect(res.status).toBe(204);
    expect(await Event.countDocuments({ partner: 'booking' })).toBe(1);
  });

  it('accepts beacon (text/plain) payloads', async () => {
    const res = await request(app).post('/api/v1/events').set('Content-Type', 'text/plain')
      .send(JSON.stringify({ type: 'outbound_click', partner: 'getyourguide', placement: 'itinerary_item' }));
    expect(res.status).toBe(204);
    expect(await Event.countDocuments({ partner: 'getyourguide' })).toBe(1);
  });

  it('rejects unknown event types', async () => {
    expect((await request(app).post('/api/v1/events').send({ type: 'purchase' })).status).toBe(400);
  });
});
