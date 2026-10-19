jest.mock('../services/destinationDataService', () => {
  const actual = jest.requireActual('../services/destinationDataService');
  return { ...actual, getDestination: jest.fn() };
});
jest.mock('../services/listingsService', () => {
  const actual = jest.requireActual('../services/listingsService');
  return { ...actual, getCityListings: jest.fn().mockResolvedValue({ place: null }) };
});

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const Itinerary = require('../model/Itinerary');
const { getDestination } = require('../services/destinationDataService');

const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const city = {
  name: 'Udaipur', lat: 24.58, lon: 73.68,
  attractions: [
    { name: 'City Palace', lat: 24.576, lon: 73.683 },
    { name: 'Jagdish Temple', lat: 24.579, lon: 73.684 },
    { name: 'Fateh Sagar Lake', lat: 24.601, lon: 73.675 },
    { name: 'Saheliyon ki Bari', lat: 24.603, lon: 73.687 },
    { name: 'Sajjangarh Palace', lat: 24.594, lon: 73.638 },
    { name: 'Bagore Ki Haveli', lat: 24.58, lon: 73.682 }
  ],
  hotels: [{ name: 'Poonam Haveli', priceMin: 2000 }, { name: 'Budget Inn', priceMin: 700 }],
  restaurants: [{ name: 'Ambrai' }, { name: '1559 AD' }]
};
const trip = { destination: 'Udaipur', checkIn: isoIn(20), checkOut: isoIn(22), travellers: 2, budget: 'Mid-range' };

const register = async (email) => (await request(app).post('/api/auth/register')
  .send({ name: 'Trip User', email, password: 'Str0ngPassword1', acceptTerms: true })).body.data.accessToken;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let me;
let friend;

beforeAll(db.connect);
beforeEach(async () => {
  process.env.AI_ENABLED = 'false';
  getDestination.mockResolvedValue(city);
  me = await register('me@example.com');
  friend = await register('friend@example.com');
});
afterEach(async () => { await db.clear(); jest.clearAllMocks(); delete process.env.AI_ENABLED; });
afterAll(db.close);

const createAs = (token) => request(app).post('/api/v1/itineraries').set(token ? auth(token) : {}).send(trip);
const edit = (id, token, body) => request(app).patch(`/api/v1/itineraries/${id}`).set(auth(token)).send(body);

describe('my trips', () => {
  it('trips created while logged in are mine and editable', async () => {
    const created = await createAs(me);
    expect(created.body.data.canEdit).toBe(true);
    const mine = await request(app).get('/api/v1/me/trips').set(auth(me));
    expect(mine.body.data.map((t) => t.id)).toEqual([created.body.data.id]);
  });

  it('others can view but not edit', async () => {
    const { id } = (await createAs(me)).body.data;
    const view = await request(app).get(`/api/v1/itineraries/${id}`).set(auth(friend));
    expect(view.body.data.canEdit).toBe(false);
    expect((await edit(id, friend, { op: 'remove', day: 1, index: 0 })).status).toBe(403);
  });

  it('saving a shared trip creates a separate copy', async () => {
    const original = (await createAs(me)).body.data;
    const saved = await request(app).post(`/api/v1/itineraries/${original.id}/copy`).set(auth(friend));
    expect(saved.status).toBe(201);
    expect(saved.body.data.id).not.toBe(original.id);
    expect(saved.body.data.canEdit).toBe(true);

    await edit(saved.body.data.id, friend, { op: 'title', title: 'Friends trip' });
    const untouched = await request(app).get(`/api/v1/itineraries/${original.id}`);
    expect(untouched.body.data.title).toBe(original.title);
  });

  it('a logged-in user gets a private copy when a plan is reused', async () => {
    const anonymous = (await createAs(null)).body.data;
    const reused = await createAs(me);
    expect(reused.body.reused).toBe(true);
    expect(reused.body.data.id).not.toBe(anonymous.id);
    expect(reused.body.data.canEdit).toBe(true);
  });

  it('edited trips are never handed to other travellers', async () => {
    const { id } = (await createAs(me)).body.data;
    await edit(id, me, { op: 'title', title: 'My custom trip' });
    const someoneElse = await createAs(null);
    expect(someoneElse.body.data.id).not.toBe(id);
    expect(someoneElse.body.data.title).not.toBe('My custom trip');
  });
});

describe('editing', () => {
  let tripData;
  beforeEach(async () => { tripData = (await createAs(me)).body.data; });

  it('removes and moves stops', async () => {
    const day2 = tripData.days[1];
    const first = day2.items[0];
    const moved = await edit(tripData.id, me, { op: 'move', day: 2, index: 0, toDay: 3, slot: first.slot === 'lunch' || first.slot === 'dinner' ? first.slot : 'morning' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.days[2].items.some((item) => item.place.name === first.place.name)).toBe(true);

    const removed = await edit(tripData.id, me, { op: 'remove', day: 3, index: 0 });
    expect(removed.status).toBe(200);
    expect(removed.body.data.edited).toBe(true);
  });

  it('offers real alternatives and swaps one in', async () => {
    const alts = await request(app).get(`/api/v1/itineraries/${tripData.id}/alternatives?group=activity&day=2`).set(auth(me));
    expect(alts.status).toBe(200);
    const used = new Set(tripData.days.flatMap((d) => d.items.map((i) => i.place.name)));
    expect(alts.body.data.every((p) => !used.has(p.name))).toBe(true);

    if (alts.body.data.length) {
      const pick = alts.body.data[0];
      const index = tripData.days[1].items.findIndex((i) => !['lunch', 'dinner'].includes(i.slot));
      const swapped = await edit(tripData.id, me, { op: 'replace', day: 2, index, place: { kind: pick.kind, name: pick.name } });
      expect(swapped.status).toBe(200);
      expect(swapped.body.data.days[1].items[index].place.name).toBe(pick.name);
    }
  });

  it('rejects invented places and wrong slots', async () => {
    const invented = await edit(tripData.id, me, { op: 'add', day: 2, slot: 'morning', place: { kind: 'attraction', name: 'Totally Real Castle' } });
    expect(invented.status).toBe(400);
    const wrongSlot = await edit(tripData.id, me, { op: 'add', day: 2, slot: 'morning', place: { kind: 'restaurant', name: 'Ambrai' } });
    expect(wrongSlot.status).toBe(400);
    expect(wrongSlot.body.message).toMatch(/lunch or dinner/);
  });

  it('adds a stay from the real list and removes one', async () => {
    const before = tripData.stays.length;
    await edit(tripData.id, me, { op: 'stay_remove', index: 0 });
    const alts = await request(app).get(`/api/v1/itineraries/${tripData.id}/alternatives?group=stay`).set(auth(me));
    const added = await edit(tripData.id, me, { op: 'stay_add', place: { kind: alts.body.data[0].kind, name: alts.body.data[0].name } });
    expect(added.status).toBe(200);
    expect(added.body.data.stays.length).toBe(before);
  });

  it('deletes a trip', async () => {
    expect((await request(app).delete(`/api/v1/itineraries/${tripData.id}`).set(auth(me))).status).toBe(204);
    expect(await Itinerary.countDocuments({ publicId: tripData.id })).toBe(0);
  });
});
