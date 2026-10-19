jest.mock('../services/destinationDataService', () => {
  const actual = jest.requireActual('../services/destinationDataService');
  return { ...actual, getDestination: jest.fn(), geocode: jest.fn() };
});
jest.mock('../services/listingsService', () => ({ getCityListings: jest.fn().mockResolvedValue({ place: null }) }));
jest.mock('../services/locationService', () => ({
  searchPlaces: jest.fn(),
  reverseGeocode: jest.fn(),
  locationFromPaste: jest.fn()
}));
const locationService = require('../services/locationService');
jest.mock('../services/notificationService', () => ({
  notifyAdminsNewListing: jest.fn(),
  notifyOwnerApproved: jest.fn(),
  notifyOwnerRejected: jest.fn()
}));
const notifications = require('../services/notificationService');

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const Listing = require('../model/Listing');
const Event = require('../model/Event');
const { getDestination } = require('../services/destinationDataService');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const homestay = {
  type: 'stay', subtype: 'homestay', name: 'Lake View Homestay', city: 'Udaipur',
  address: 'Lal Ghat', lat: 24.578, lon: 73.682, priceMin: 1800, priceUnit: 'night',
  description: 'Family-run homestay with a rooftop facing Lake Pichola.',
  contact: { whatsapp: '98765 43210' }
};

const register = async (name, email) => {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'Str0ngPassword1', acceptTerms: true });
  return res.body.data.accessToken;
};

let owner;
let admin;
let stranger;

beforeAll(async () => {
  process.env.ADMIN_EMAILS = 'boss@example.com';
  await db.connect();
  await Listing.init(); // 2dsphere index for $near
});
beforeEach(async () => {
  owner = await register('Owner One', 'owner@example.com');
  admin = await register('Boss Admin', 'boss@example.com');
  stranger = await register('Some One', 'other@example.com');
});
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(async () => { delete process.env.ADMIN_EMAILS; await db.close(); });

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const submit = (body = homestay, token = owner) =>
  request(app).post('/api/v1/partner/listings').set(auth(token)).send(body);
const approve = (id) => request(app).post(`/api/v1/admin/listings/${id}/approve`).set(auth(admin));

describe('partner listings', () => {
  it('requires login', async () => {
    expect((await request(app).post('/api/v1/partner/listings').send(homestay)).status).toBe(401);
  });

  it('requires a map location and a way to contact the business', async () => {
    const res = await submit({ ...homestay, lat: undefined, contact: {} });
    expect(res.status).toBe(400);
    const messages = res.body.errors.map((e) => e.message).join(' ');
    expect(messages).toMatch(/Set the location on the map/);
    expect(messages).toMatch(/phone, WhatsApp number or website/);
  });

  it('rejects a category that does not match the type', async () => {
    expect((await submit({ ...homestay, subtype: 'dhaba' })).status).toBe(400);
  });

  it('creates a pending listing that is not public until approved', async () => {
    const created = await submit();
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('pending');
    const { id } = created.body.data;

    expect((await request(app).get(`/api/v1/listings/${id}`)).status).toBe(404);
    expect((await approve(id)).status).toBe(200);

    const pub = await request(app).get(`/api/v1/listings/${id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.whatsappLink).toContain('https://wa.me/919876543210');
    expect(pub.body.data).not.toHaveProperty('contact'); // raw contact not exposed
    expect(pub.body.data).not.toHaveProperty('ownerId');
  });

  it('cannot be approved by non-admins, or edited by other users', async () => {
    const { id } = (await submit()).body.data;
    expect((await request(app).post(`/api/v1/admin/listings/${id}/approve`).set(auth(stranger))).status).toBe(403);
    expect((await request(app).patch(`/api/v1/partner/listings/${id}`).set(auth(stranger)).send({ name: 'Hijacked' })).status).toBe(404);
  });

  it('owner edits send an approved listing back for review', async () => {
    const { id } = (await submit()).body.data;
    await approve(id);
    const edited = await request(app).patch(`/api/v1/partner/listings/${id}`).set(auth(owner)).send({ priceMin: 2200 });
    expect(edited.body.data.status).toBe('pending');
  });

  it('owners cannot set status or featured themselves', async () => {
    const res = await submit({ ...homestay, status: 'approved', featured: true });
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.featured).toBe(false);
  });

  it('emails admins on submission and the owner on approval', async () => {
    const { id } = (await submit()).body.data;
    expect(notifications.notifyAdminsNewListing).toHaveBeenCalled();
    await approve(id);
    expect(notifications.notifyOwnerApproved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lake View Homestay' }));
  });

  it('admin can reject with a reason the owner sees', async () => {
    const { id } = (await submit()).body.data;
    await request(app).post(`/api/v1/admin/listings/${id}/reject`).set(auth(admin)).send({ reason: 'Please add real photos' });
    const mine = await request(app).get('/api/v1/partner/listings').set(auth(owner));
    expect(mine.body.data[0].status).toBe('rejected');
    expect(mine.body.data[0].rejectionReason).toBe('Please add real photos');
  });

  it('accepts real images only and serves them', async () => {
    const { id } = (await submit()).body.data;
    const bad = await request(app).post(`/api/v1/partner/listings/${id}/photos`).set(auth(owner))
      .set('Content-Type', 'image/jpeg').send(Buffer.from('<script>alert(1)</script>'));
    expect(bad.status).toBe(400);

    const good = await request(app).post(`/api/v1/partner/listings/${id}/photos`).set(auth(owner))
      .set('Content-Type', 'image/jpeg').send(JPEG);
    expect(good.status).toBe(201);
    const photoPath = good.body.data.photos[0];
    const photo = await request(app).get(photoPath);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
  });

  it('records leads from WhatsApp taps (including beacon payloads)', async () => {
    const { id } = (await submit()).body.data;
    await approve(id);
    const res = await request(app).post(`/api/v1/listings/${id}/lead`).set('Content-Type', 'text/plain')
      .send(JSON.stringify({ channel: 'whatsapp', placement: 'itinerary_stay' }));
    expect(res.status).toBe(204);
    expect((await Listing.findById(id)).leads).toBe(1);
    expect(await Event.countDocuments({ type: 'lead', partner: 'whatsapp' })).toBe(1);
  });

  it('admin overview counts listings and leads', async () => {
    await submit();
    const res = await request(app).get('/api/v1/admin/overview').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.listings.pending).toBe(1);
  });
});

describe('location helpers', () => {
  it('suggests addresses', async () => {
    locationService.searchPlaces.mockResolvedValue([{ lat: 24.58, lon: 73.68, displayName: 'Lal Ghat, Udaipur', city: 'Udaipur' }]);
    const res = await request(app).get('/api/v1/geocode?q=Lal%20Ghat%20Udaipur');
    expect(res.status).toBe(200);
    expect(res.body.results[0].city).toBe('Udaipur');
  });

  it('turns a pasted Google Maps link into a pin with an address (login required)', async () => {
    locationService.locationFromPaste.mockResolvedValue({ lat: 24.5764, lon: 73.6835, name: 'City Palace' });
    locationService.reverseGeocode.mockResolvedValue({ lat: 24.5764, lon: 73.6835, city: 'Udaipur', area: 'Bhatiyani Chotta' });
    expect((await request(app).post('/api/v1/geocode/link').send({ link: 'https://maps.app.goo.gl/x' })).status).toBe(401);
    const res = await request(app).post('/api/v1/geocode/link').set(auth(owner)).send({ link: 'https://maps.app.goo.gl/x' });
    expect(res.body.data).toMatchObject({ lat: 24.5764, lon: 73.6835, city: 'Udaipur', name: 'City Palace' });
  });

  it('explains how to get a link when it cannot be read', async () => {
    locationService.locationFromPaste.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/geocode/link').set(auth(owner)).send({ link: 'hello there' });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Share/);
  });
});

describe('partners in trip plans', () => {
  const city = {
    name: 'Udaipur', lat: 24.58, lon: 73.68, bbox: [24.5, 24.65, 73.6, 73.75],
    attractions: [
      { name: 'City Palace', lat: 24.576, lon: 73.683 },
      { name: 'Jagdish Temple', lat: 24.579, lon: 73.684 },
      { name: 'Fateh Sagar Lake', lat: 24.601, lon: 73.675 }
    ],
    hotels: [{ name: 'Poonam Haveli', priceMin: 2000 }, { name: 'Budget Inn', priceMin: 700 }, { name: 'Grand', priceMin: 9000 }],
    restaurants: [{ name: 'Ambrai' }]
  };
  const trip = { destination: 'Udaipur', checkIn: isoIn(20), checkOut: isoIn(22), travellers: 2, budget: 'Mid-range' };

  beforeEach(() => {
    process.env.AI_ENABLED = 'false'; // deterministic planner
    getDestination.mockResolvedValue(city);
  });
  afterEach(() => { delete process.env.AI_ENABLED; });

  it('includes approved partner stays with WhatsApp contact, and labels featured ones', async () => {
    const { id } = (await submit()).body.data;
    await approve(id);
    await request(app).post(`/api/v1/admin/listings/${id}/feature`).set(auth(admin)).send({ featured: true });

    const res = await request(app).post('/api/v1/itineraries').send(trip);
    expect(res.status).toBe(201);
    const partnerStay = res.body.data.stays.find((stay) => stay.place.name === 'Lake View Homestay');
    expect(partnerStay).toBeDefined();
    expect(partnerStay.place.partner).toBe(true);
    expect(partnerStay.place.sponsored).toBe(true);
    expect(partnerStay.place.whatsappLink).toContain('wa.me/919876543210');
    expect(partnerStay.place.whatsappLink).toContain(encodeURIComponent(trip.checkIn));
    expect(partnerStay.place).not.toHaveProperty('contact');
    expect(res.body.data.hasPartners).toBe(true);
  });

  it('ignores pending listings', async () => {
    await submit();
    const res = await request(app).post('/api/v1/itineraries').send(trip);
    expect(JSON.stringify(res.body.data)).not.toContain('Lake View Homestay');
  });
});
