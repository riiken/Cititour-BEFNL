jest.mock('../config/gemini', () => ({
  generateTravelRecommendation: jest.fn(),
  generateQuickSuggestion: jest.fn()
}));
jest.mock('../config/groq', () => ({
  generateGroqRecommendation: jest.fn(),
  generateGroqQuickSuggestion: jest.fn()
}));

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const gemini = require('../config/gemini');
const groq = require('../config/groq');
const AiResponse = require('../model/aiResponse');

const guide = {
  destination: 'Jaipur',
  budget: '₹25,000 - ₹40,000',
  travelGuide: [{ placeName: 'Amber Fort', explanation: 'Hilltop fort.', location: 'Amer', websitelink: 'https://made-up.example' }],
  stayGuide: [{ placeName: 'Rambagh Palace', explanation: 'Heritage hotel.', location: 'Bhawani Singh Rd', cost: '₹30,000/night' }],
  foodGuide: [{ placeName: 'Laxmi Misthan Bhandar', explanation: 'Classic sweets.', location: 'Johari Bazaar', cost: '₹300' }]
};

beforeAll(db.connect);
afterEach(async () => {
  await db.clear();
  jest.clearAllMocks();
  delete process.env.AI_DAILY_GENERATION_LIMIT;
  delete process.env.AI_ENABLED;
});
afterAll(db.close);

const ask = (body) => request(app).post('/api/ai/query').send(body);

describe('POST /api/ai/query', () => {
  it('returns all three guides with deterministic links (no model URLs)', async () => {
    gemini.generateTravelRecommendation.mockResolvedValue(JSON.stringify(guide));

    const res = await ask({ query: 'Plan a trip to Jaipur from 2099-01-10 to 2099-01-13.' });

    expect(res.status).toBe(200);
    const { travelGuide, stayGuide, foodGuide } = res.body.guides;
    expect(stayGuide[0].placeName).toBe('Rambagh Palace');
    expect(stayGuide[0].cost).toBe('₹30,000/night');
    expect(foodGuide[0].placeName).toBe('Laxmi Misthan Bhandar');
    expect(travelGuide[0].mapsLink).toContain('google.com/maps');
    expect(stayGuide[0].bookingLink).toContain('booking.com');
    expect(JSON.stringify(res.body)).not.toContain('made-up.example');
  });

  it('falls back to Groq when Gemini fails', async () => {
    gemini.generateTravelRecommendation.mockRejectedValue(new Error('model retired'));
    groq.generateGroqRecommendation.mockResolvedValue(JSON.stringify(guide));

    const res = await ask({ query: 'Plan a trip to Jaipur.' });
    expect(res.status).toBe(200);
    expect(groq.generateGroqRecommendation).toHaveBeenCalled();
  });

  it('returns 503 and caches nothing when every provider fails', async () => {
    gemini.generateTravelRecommendation.mockRejectedValue(new Error('down'));
    groq.generateGroqRecommendation.mockResolvedValue('not json');

    const res = await ask({ query: 'Plan a trip to Jaipur.' });
    expect(res.status).toBe(503);
    expect(await AiResponse.countDocuments()).toBe(0);
  });

  it('serves a repeated query from cache', async () => {
    gemini.generateTravelRecommendation.mockResolvedValue(JSON.stringify(guide));
    await ask({ query: 'Plan a trip to Jaipur.' });
    await ask({ query: '  plan a trip to   JAIPUR. ' });
    expect(gemini.generateTravelRecommendation).toHaveBeenCalledTimes(1);
  });

  it('accepts non-English queries', async () => {
    gemini.generateTravelRecommendation.mockResolvedValue(JSON.stringify(guide));
    const res = await ask({ query: 'जयपुर की 3 दिन की यात्रा की योजना बनाएं' });
    expect(res.status).toBe(200);
  });

  it('stops generating when the daily budget is used up', async () => {
    process.env.AI_DAILY_GENERATION_LIMIT = '1';
    gemini.generateTravelRecommendation.mockResolvedValue(JSON.stringify(guide));

    expect((await ask({ query: 'Plan a trip to Jaipur.' })).status).toBe(200);
    const res = await ask({ query: 'Plan a trip to Udaipur.' });
    expect(res.status).toBe(503);
    expect(gemini.generateTravelRecommendation).toHaveBeenCalledTimes(1);
  });

  it('honours the AI kill-switch', async () => {
    process.env.AI_ENABLED = 'false';
    const res = await ask({ query: 'Plan a trip to Jaipur.' });
    expect(res.status).toBe(503);
    expect(gemini.generateTravelRecommendation).not.toHaveBeenCalled();
  });
});
