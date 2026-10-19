const axios = require('axios');

/**
 * Identify CitiTour to public APIs. Wikimedia and OpenStreetMap require a
 * User-Agent with a way to contact the operator and rate-limit clients
 * without one (HTTP 429).
 */
const userAgent = () => {
  const contact = [process.env.APP_URL || 'https://cititour.onrender.com', process.env.CONTACT_EMAIL]
    .filter(Boolean)
    .join('; ');
  return `CitiTour/1.0 (${contact})`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET with our User-Agent and one polite retry on 429/5xx (honours
 * Retry-After up to 5 s).
 */
const politeGet = async (url, { params, headers = {}, timeout = 8000 } = {}) => {
  const request = () => axios.get(url, { params, timeout, headers: { 'User-Agent': userAgent(), ...headers } });
  try {
    return await request();
  } catch (error) {
    const status = error.response && error.response.status;
    if (status !== 429 && !(status >= 500)) throw error;
    const retryAfter = Number(error.response.headers && error.response.headers['retry-after']);
    await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1500, 5000));
    return request();
  }
};

module.exports = { userAgent, politeGet };
