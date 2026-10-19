const request = require('supertest');
const db = require('./db');
const app = require('../app');

beforeAll(db.connect);
afterAll(db.close);

describe('misc endpoints', () => {
  it('health and readiness', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/ready')).status).toBe(200);
  });

  it('retired popularLocation responds 410 instead of hanging', async () => {
    const res = await request(app).post('/api/ai/popularLocation').send({ location: 'India' });
    expect(res.status).toBe(410);
  });

  it('contact form reports 503 when email is not configured, without leaking details', async () => {
    const res = await request(app).post('/api/ai/sendEmail')
      .send({ name: 'Ravi', email: 'ravi@example.com', subject: 'Hello', message: 'I have a question about Goa.' });
    expect(res.status).toBe(503);
    expect(res.body).not.toHaveProperty('error');
  });

  it('rejects oversized destination search limits', async () => {
    const res = await request(app).get('/api/destinations/search?q=goa&limit=500');
    expect(res.status).toBe(400);
  });
});
