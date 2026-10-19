jest.mock('axios');
const axios = require('axios');
const { coordsFromUrl, placeNameFromUrl, resolveShortLink, ALLOWED_HOSTS } = require('../services/locationService');

describe('Google Maps link parsing', () => {
  it('prefers the place pin over the viewport', () => {
    expect(coordsFromUrl('https://www.google.com/maps/place/X/@24.50,73.60,17z/data=!3m1!8m2!3d24.5764!4d73.6835'))
      .toEqual({ lat: 24.5764, lon: 73.6835 });
  });

  it('reads ?q=, query= and @ forms', () => {
    expect(coordsFromUrl('https://maps.google.com/?q=30.1296,78.3254')).toEqual({ lat: 30.1296, lon: 78.3254 });
    expect(coordsFromUrl('https://www.google.com/maps/search/?api=1&query=15.49,73.82')).toEqual({ lat: 15.49, lon: 73.82 });
    expect(coordsFromUrl('https://www.google.com/maps/@12.97,77.59,15z')).toEqual({ lat: 12.97, lon: 77.59 });
  });

  it('extracts the place name when there are no coordinates', () => {
    expect(placeNameFromUrl('https://www.google.com/maps/place/Jagdish+Temple,+Udaipur')).toBe('Jagdish Temple, Udaipur');
  });

  it('only allows Google Maps hosts', () => {
    expect(ALLOWED_HOSTS.test('maps.app.goo.gl')).toBe(true);
    expect(ALLOWED_HOSTS.test('www.google.co.in')).toBe(true);
    expect(ALLOWED_HOSTS.test('google.com.evil.io')).toBe(false);
    expect(ALLOWED_HOSTS.test('169.254.169.254')).toBe(false);
  });
});

describe('short link resolution', () => {
  afterEach(() => jest.resetAllMocks());

  it('follows redirects to the final Google Maps URL', async () => {
    axios.head.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'https://www.google.com/maps/place/Cafe/@30.1,78.3,17z/data=!3d30.1296!4d78.3254' }
    });
    const final = await resolveShortLink('https://maps.app.goo.gl/AbCdEf');
    expect(coordsFromUrl(final)).toEqual({ lat: 30.1296, lon: 78.3254 });
  });

  it('refuses to follow a redirect to a non-Google host', async () => {
    axios.head.mockResolvedValueOnce({ status: 302, headers: { location: 'http://169.254.169.254/latest' } });
    await expect(resolveShortLink('https://maps.app.goo.gl/AbCdEf')).rejects.toThrow('Only Google Maps links');
  });

  it('unwraps consent.google.com continue= URLs', async () => {
    axios.head.mockResolvedValueOnce({
      status: 302,
      headers: { location: 'https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2F%4012.97%2C77.59%2C15z' }
    });
    const final = await resolveShortLink('https://maps.app.goo.gl/XyZ');
    expect(coordsFromUrl(final)).toEqual({ lat: 12.97, lon: 77.59 });
  });
});
