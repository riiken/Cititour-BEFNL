jest.mock('axios');
const axios = require('axios');
const request = require('supertest');
const db = require('./db');
const app = require('../app');
const Place = require('../model/Hotel');

const providerResponse = (path) => {
  if (path.includes('hotels')) {
    return { data: { data: [
      { id: 101, name: 'Sea View Resort', rating: 4.5, price: { priceMin: 3000, currency: 'INR' }, address: { city: 'Goa' } },
      { name: 'No Id Inn', contacts: undefined } // missing id and contacts must not crash
    ] } };
  }
  if (path.includes('restaurants')) return { data: { data: [{ name: 'Fish Thali House', rating: 4.2 }] } };
  return { data: { data: [{ title: 'Dudhsagar Falls Trip', price: { total: '2500' } }] } };
};

beforeAll(db.connect);
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(db.close);

describe('POST /api/ai/recommendlocation', () => {
  beforeEach(() => {
    axios.get.mockImplementation((url) => Promise.resolve(providerResponse(url)));
  });

  it('accepts `location` (sent by the web/Android app)', async () => {
    const res = await request(app).post('/api/ai/recommendlocation').send({ location: 'Goa' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('api');
    expect(res.body.data.hotels).toHaveLength(2);
    expect(res.body.data.hotels[1].hotelId).toEqual(expect.any(String));
  });

  it('accepts `place` as an alias', async () => {
    const res = await request(app).post('/api/ai/recommendlocation').send({ place: 'Goa' });
    expect(res.status).toBe(200);
    expect(res.body.data.restaurants[0].name).toBe('Fish Thali House');
  });

  it('calls the three provider endpoints once, then serves from cache', async () => {
    await request(app).post('/api/ai/recommendlocation').send({ location: 'Goa' });
    expect(axios.get).toHaveBeenCalledTimes(3);

    const res = await request(app).post('/api/ai/recommendlocation').send({ location: '  goa ' });
    expect(res.body.source).toBe('db');
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('adds booking links to hotels and tours', async () => {
    const res = await request(app)
      .post('/api/ai/recommendlocation')
      .send({ location: 'Goa', checkIn: '2099-01-10', checkOut: '2099-01-12' });
    expect(res.body.data.hotels[0].bookingUrl).toContain('booking.com/searchresults.html');
    expect(res.body.data.hotels[0].bookingUrl).toContain('checkin=2099-01-10');
    expect(res.body.data.tours[0].bookingUrl).toContain('getyourguide.com');
    expect(res.body.data.restaurants[0].mapsUrl).toContain('google.com/maps');
  });

  it('includes the affiliate id when configured', async () => {
    process.env.BOOKING_AFFILIATE_ID = '1234567';
    const res = await request(app).post('/api/ai/recommendlocation').send({ location: 'Goa' });
    delete process.env.BOOKING_AFFILIATE_ID;
    expect(res.body.data.hotels[0].bookingUrl).toContain('aid=1234567');
  });

  it('does not cache an empty result', async () => {
    axios.get.mockRejectedValue(new Error('provider down'));
    const res = await request(app).post('/api/ai/recommendlocation').send({ location: 'Nowhere' });
    expect(res.status).toBe(200);
    expect(res.body.data.hotels).toEqual([]);
    expect(await Place.countDocuments()).toBe(0);
  });

  it('serves stale data when a refresh fails', async () => {
    await Place.create({
      place: 'goa',
      hotels: [{ hotelId: '1', name: 'Old Hotel' }],
      restaurants: [{ name: 'Old Cafe' }],
      tours: [{ title: 'Old Tour' }],
      refreshedAt: new Date('2020-01-01')
    });
    axios.get.mockRejectedValue(new Error('provider down'));
    const res = await request(app).post('/api/ai/recommendlocation').send({ location: 'Goa' });
    expect(res.body.stale).toBe(true);
    expect(res.body.data.hotels[0].name).toBe('Old Hotel');
  });

  it('rejects a missing location', async () => {
    const res = await request(app).post('/api/ai/recommendlocation').send({});
    expect(res.status).toBe(400);
  });
});
