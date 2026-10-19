jest.mock('../services/destinationDataService', () => {
  const actual = jest.requireActual('../services/destinationDataService');
  return { ...actual, getDestination: jest.fn() };
});

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const Listing = require('../model/Listing');
const { getDestination } = require('../services/destinationDataService');
const { poolCache } = require('../controllers/exploreController');

const city = {
  name: 'Udaipur', displayName: 'Udaipur, Rajasthan, India', lat: 24.58, lon: 73.68,
  guide: { title: 'Udaipur', url: 'https://en.wikivoyage.org/wiki/Udaipur' },
  attractions: [{ name: 'City Palace', lat: 24.576, lon: 73.683 }, { name: 'Jagdish Temple', lat: 24.579, lon: 73.684 }],
  hotels: [{ name: 'Poonam Haveli', priceMin: 2000 }],
  restaurants: [{ name: 'Ambrai' }]
};

beforeAll(async () => { await db.connect(); await Listing.init(); });
beforeEach(() => { poolCache.clear(); getDestination.mockResolvedValue(city); });
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(db.close);

describe('GET /api/v1/explore/:destination', () => {
  it('groups real places with links', async () => {
    const res = await request(app).get('/api/v1/explore/Udaipur?checkIn=2099-01-10&checkOut=2099-01-12&travellers=2');
    expect(res.status).toBe(200);
    const { sections, counts, guide } = res.body.data;
    expect(sections.see.map((p) => p.name)).toEqual(['City Palace', 'Jagdish Temple']);
    expect(sections.stay[0].bookingLink).toContain('checkin=2099-01-10');
    expect(sections.see[0].mapsLink).toContain('google.com/maps');
    expect(counts).toEqual({ see: 2, do: 0, stay: 1, eat: 1 });
    expect(guide.title).toBe('Udaipur');
    expect(JSON.stringify(res.body)).not.toContain('"zone"');
  });

  it('includes approved partner businesses first, with contact links but not raw contact details', async () => {
    await Listing.create({
      ownerId: '64b000000000000000000001', type: 'restaurant', name: 'Rooftop Thali', city: 'Udaipur', cityKey: 'udaipur',
      location: { type: 'Point', coordinates: [73.683, 24.577] }, contact: { whatsapp: '9876543210' }, status: 'approved'
    });
    const res = await request(app).get('/api/v1/explore/Udaipur');
    const first = res.body.data.sections.eat[0];
    expect(first.name).toBe('Rooftop Thali');
    expect(first.partner).toBe(true);
    expect(first.whatsappLink).toContain('wa.me/919876543210');
    expect(first).not.toHaveProperty('contact');
  });

  it('404s for unknown places', async () => {
    getDestination.mockResolvedValue(null);
    expect((await request(app).get('/api/v1/explore/Atlantis')).status).toBe(404);
  });
});
