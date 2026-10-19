jest.mock('../config/mailer', () => ({
  sendMailSafe: jest.fn().mockResolvedValue(true),
  appUrl: () => 'https://cititour.example',
  adminEmails: () => []
}));
jest.mock('../services/openWeatherService', () => ({
  isOpenWeatherAvailable: () => true,
  getForecast: jest.fn()
}));

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const User = require('../model/User');
const Itinerary = require('../model/Itinerary');
const { sendMailSafe } = require('../config/mailer');
const openWeather = require('../services/openWeatherService');
const { runPreTripReminders, istDate, unsubscribeToken } = require('../services/reminderService');

let user;
const tripStarting = (days, extra = {}) => Itinerary.create({
  publicId: `trip${Math.random().toString(36).slice(2, 10)}`,
  userId: user._id,
  title: 'Goa beaches',
  request: { destination: 'Goa', checkIn: istDate(days), checkOut: istDate(days + 3), travellers: 2, budget: 'Mid-range', language: 'en' },
  destination: { name: 'Goa' },
  days: [],
  stays: [],
  ...extra
});

beforeAll(db.connect);
beforeEach(async () => {
  user = await User.create({ name: 'Asha', email: 'asha@example.com', password: 'Str0ngPassword1' });
  openWeather.getForecast.mockResolvedValue({ dailyForecasts: [
    { date: istDate(2), description: 'moderate rain', minTemperature: 24, maxTemperature: 29, precipitationProbability: 80 }
  ] });
});
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(db.close);

describe('pre-trip reminders', () => {
  it('emails trips starting in 2 days once, with forecast, plan and stay links', async () => {
    await tripStarting(2);
    await tripStarting(5); // not due yet

    const first = await runPreTripReminders();
    expect(first.sent).toBe(1);
    const mail = sendMailSafe.mock.calls[0][0];
    expect(mail.to).toBe('asha@example.com');
    expect(mail.subject).toBe('Your Goa trip starts in 2 days');
    expect(mail.text).toContain('moderate rain');
    expect(mail.text).toContain('pack an umbrella');
    expect(mail.text).toContain('https://cititour.example/trip/');
    expect(mail.text).toContain('booking.com');
    expect(mail.text).toContain('/api/v1/unsubscribe?u=');

    const second = await runPreTripReminders();
    expect(second.checked).toBe(0); // already reminded
    expect(sendMailSafe).toHaveBeenCalledTimes(1);
  });

  it('writes Hindi emails for Hindi trips', async () => {
    await tripStarting(2, { request: { destination: 'Goa', checkIn: istDate(2), checkOut: istDate(4), travellers: 2, language: 'hi' } });
    await runPreTripReminders();
    expect(sendMailSafe.mock.calls[0][0].subject).toBe('आपकी Goa यात्रा 2 दिन में शुरू हो रही है');
  });

  it('respects unsubscribe, via a signed link only', async () => {
    const bad = await request(app).get(`/api/v1/unsubscribe?u=${user._id}&t=${'0'.repeat(32)}`);
    expect(bad.status).toBe(400);
    const good = await request(app).get(`/api/v1/unsubscribe?u=${user._id}&t=${unsubscribeToken(String(user._id))}`);
    expect(good.status).toBe(200);

    await tripStarting(2);
    const result = await runPreTripReminders();
    expect(result.sent).toBe(0);
    expect(sendMailSafe).not.toHaveBeenCalled();
  });

  it('can be switched off from the profile', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Ravi Kumar', email: 'ravi@example.com', password: 'Str0ngPassword1', acceptTerms: true });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`).send({ tripReminders: false });
    expect(res.body.data.user.notifications.tripReminders).toBe(false);
  });

  it('ignores anonymous plans', async () => {
    await tripStarting(2, { userId: null });
    expect((await runPreTripReminders()).checked).toBe(0);
  });
});
