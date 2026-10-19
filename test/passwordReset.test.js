jest.mock('../config/mailer', () => ({
  sendMailSafe: jest.fn().mockResolvedValue(true),
  appUrl: () => 'https://cititour.example',
  adminEmails: () => []
}));

const request = require('supertest');
const db = require('./db');
const app = require('../app');
const User = require('../model/User');
const { sendMailSafe } = require('../config/mailer');

const account = { name: 'Asha Rao', email: 'asha@example.com', password: 'Str0ngPassword1', acceptTerms: true };

const tokenFromEmail = () => {
  const link = sendMailSafe.mock.calls[0][0].text.match(/https:\/\/\S+/)[0];
  return new URL(link).searchParams.get('token');
};

beforeAll(db.connect);
afterEach(async () => { await db.clear(); jest.clearAllMocks(); });
afterAll(db.close);

describe('password reset', () => {
  it('responds the same for unknown and known emails', async () => {
    await request(app).post('/api/auth/register').send(account);
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    const known = await request(app).post('/api/auth/forgot-password').send({ email: account.email });
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(sendMailSafe).toHaveBeenCalledTimes(1);
    expect(sendMailSafe.mock.calls[0][0].to).toBe(account.email);
  });

  it('stores only a hash of the token, resets once, and signs out other sessions', async () => {
    const { body } = await request(app).post('/api/auth/register').send(account);
    await request(app).post('/api/auth/forgot-password').send({ email: account.email });
    const token = tokenFromEmail();

    const stored = await User.findOne({ email: account.email }).select('+passwordResetToken');
    expect(stored.passwordResetToken).not.toBe(token);

    const reset = await request(app).post('/api/auth/reset-password')
      .send({ email: account.email, token, password: 'NewPassw0rdX' });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: account.email, password: 'NewPassw0rdX' });
    expect(login.status).toBe(200);
    const oldSession = await request(app).post('/api/auth/refresh').send({ refreshToken: body.data.refreshToken });
    expect(oldSession.status).toBe(401);

    const again = await request(app).post('/api/auth/reset-password')
      .send({ email: account.email, token, password: 'Another1Pass' });
    expect(again.status).toBe(400);
  });

  it('rejects expired links', async () => {
    // (forgot-password is limited to 3 requests/hour per IP, so set the token up directly)
    await request(app).post('/api/auth/register').send(account);
    const token = 'b'.repeat(64);
    await User.updateOne({ email: account.email }, {
      $set: { passwordResetToken: User.hashToken(token), passwordResetExpires: new Date(Date.now() - 1000) }
    });
    const res = await request(app).post('/api/auth/reset-password')
      .send({ email: account.email, token, password: 'NewPassw0rdX' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/);
  });

  it('enforces the password rules', async () => {
    const res = await request(app).post('/api/auth/reset-password')
      .send({ email: account.email, token: 'a'.repeat(64), password: 'weak' });
    expect(res.status).toBe(400);
  });
});
