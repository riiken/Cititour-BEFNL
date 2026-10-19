const request = require('supertest');

describe('configured frontend origins', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('accepts every origin in a comma-separated FRONTEND_URL_PROD', async () => {
    process.env.FRONTEND_URL_PROD = 'https://cititour.aionboard.net, https://cititour.onrender.com/';
    let app;
    jest.isolateModules(() => { app = require('../app'); });

    const allowed = await request(app).get('/health').set('Origin', 'https://cititour.aionboard.net');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://cititour.aionboard.net');

    const other = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('uses the first configured origin for links in emails', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL_PROD = 'https://cititour.aionboard.net/, https://cititour.onrender.com';
    const { appUrl } = require('../config/mailer');
    expect(appUrl()).toBe('https://cititour.aionboard.net');

    delete process.env.FRONTEND_URL_PROD;
    delete process.env.APP_URL;
    expect(appUrl()).toBe('https://cititour.onrender.com');
  });
});
