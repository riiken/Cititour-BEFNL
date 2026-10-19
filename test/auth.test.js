const request = require('supertest');
const db = require('./db');
const app = require('../app');
const User = require('../model/User');
const logger = require('../config/logger');

beforeAll(db.connect);
afterEach(async () => { await db.clear(); jest.restoreAllMocks(); });
afterAll(db.close);

const credentials = { name: 'Asha Rao', email: 'asha@example.com', password: 'Str0ngPass<word>', acceptTerms: true };

const register = () => request(app).post('/api/auth/register').send(credentials);

describe('auth', () => {
  it('registers and logs in with a password containing < and >', async () => {
    expect((await register()).status).toBe(201);
    const res = await request(app).post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('stores only a hash of the refresh token and rotates it', async () => {
    const { body } = await register();
    const stored = await User.findOne({ email: credentials.email }).select('+refreshToken');
    expect(stored.refreshToken).not.toBe(body.data.refreshToken);
    expect(stored.refreshToken).toBe(User.hashToken(body.data.refreshToken));

    // Ensure a different iat so the rotated token differs
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: body.data.refreshToken });
    expect(refreshed.status).toBe(200);

    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: body.data.refreshToken });
    expect(reused.status).toBe(401);
  });

  it('still accepts a legacy plaintext refresh token', async () => {
    const { body } = await register();
    await User.updateOne({ email: credentials.email }, { $set: { refreshToken: body.data.refreshToken } });
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: body.data.refreshToken });
    expect(res.status).toBe(200);
  });

  it('never logs the password on a failed login', async () => {
    await register();
    const calls = [];
    for (const level of ['warn', 'error', 'info']) {
      jest.spyOn(logger, level).mockImplementation((...args) => { calls.push(JSON.stringify(args)); });
    }
    const res = await request(app).post('/api/auth/login')
      .send({ email: credentials.email, password: 'Wr0ngSecretValue' });
    expect(res.status).toBe(401);
    expect(calls.join('\n')).not.toContain('Wr0ngSecretValue');
  });

  it('requires accepting the terms and records when they were accepted', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...credentials, acceptTerms: false });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Terms');

    await register();
    const user = await User.findOne({ email: credentials.email });
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it('logs out with only the refresh token (expired access token)', async () => {
    const { body } = await register();
    const res = await request(app).post('/api/auth/logout').send({ refreshToken: body.data.refreshToken });
    expect(res.status).toBe(200);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: body.data.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('does not echo submitted values in validation errors', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ ...credentials, password: 'weakpw' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('weakpw');
  });
});

describe('usage quotas', () => {
  const login = async () => (await register()).body.data.accessToken;

  it('resets the daily search window instead of locking the user out forever', async () => {
    const token = await login();
    await User.updateOne({ email: credentials.email }, {
      $set: {
        'usage.searchRequestCount': 500,
        'usage.searchRequestsToday': 100,
        'usage.searchDayStart': new Date('2020-01-01')
      }
    });

    const res = await request(app).get('/api/auth/usage').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.usage.search.remaining).toBe(100);
  });

  it('returns a readable 429 message with upgrade details', async () => {
    const token = await login();
    await User.updateOne({ email: credentials.email }, {
      $set: { 'usage.emailRequestsToday': 5, 'usage.emailDayStart': new Date() }
    });

    const res = await request(app).post('/api/ai/sendEmail')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Asha', email: 'asha@example.com', subject: 'Hi', message: 'Hello there, a question.' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/free tier limit/);
    expect(res.body.upgrade).toBeDefined();
  });

  it('does not count invalid requests against the quota', async () => {
    const token = await login();
    await request(app).post('/api/ai/recommendlocation')
      .set('Authorization', `Bearer ${token}`).send({});
    const user = await User.findOne({ email: credentials.email });
    expect(user.usage.searchRequestCount).toBe(0);
  });
});
