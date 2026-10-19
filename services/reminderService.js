const crypto = require('crypto');
const Itinerary = require('../model/Itinerary');
const User = require('../model/User');
const logger = require('../config/logger');
const openWeatherService = require('./openWeatherService');
const { sendMailSafe, appUrl } = require('../config/mailer');
const { hotelBookingLink } = require('./linkBuilder');

/**
 * Pre-trip reminder emails: two days before a saved trip starts, send the
 * forecast, a link back to the plan/packing list and a booking nudge.
 * Each trip is claimed atomically, so it is reminded at most once even when
 * several server instances run the job.
 */

const DAYS_BEFORE = 2;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD in India time, `days` from now. */
const istDate = (days = 0, now = Date.now()) =>
  new Date(now + IST_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);

const remindersEnabled = () =>
  process.env.REMINDERS_ENABLED
    ? process.env.REMINDERS_ENABLED === 'true'
    : process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------- unsubscribe

const unsubscribeToken = (userId) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(`unsubscribe:${userId}`).digest('hex').slice(0, 32);

const unsubscribeLink = (userId) => {
  const api = (process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  return `${api}/api/v1/unsubscribe?u=${userId}&t=${unsubscribeToken(String(userId))}`;
};

const verifyUnsubscribe = (userId, token) => {
  const expected = unsubscribeToken(String(userId));
  return typeof token === 'string' && token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
};

// ---------------------------------------------------------------- content

const TEXT = {
  en: {
    subject: (trip) => `Your ${trip.destination} trip starts in 2 days`,
    hello: (name) => `Hi ${name},`,
    intro: (trip) => `Your trip to ${trip.destination} starts on ${trip.date}. Here's what to expect.`,
    weather: 'Weather forecast',
    rain: 'Rain is likely on some days: pack an umbrella and keep an indoor option ready.',
    hot: 'It will be hot: carry water, sunscreen and plan outdoor visits for the morning.',
    cold: 'It will be cold: pack warm layers.',
    noForecast: 'The forecast is not available yet. Check again closer to the day.',
    plan: 'Open your plan and packing checklist',
    noStay: "Haven't booked a place to stay yet?",
    findStay: 'See stays for your dates',
    footer: 'You receive this because you saved this trip on CitiTour.',
    unsubscribe: 'Stop trip reminders'
  },
  hi: {
    subject: (trip) => `आपकी ${trip.destination} यात्रा 2 दिन में शुरू हो रही है`,
    hello: (name) => `नमस्ते ${name},`,
    intro: (trip) => `${trip.destination} की आपकी यात्रा ${trip.date} को शुरू हो रही है। मौसम और तैयारी की जानकारी:`,
    weather: 'मौसम का पूर्वानुमान',
    rain: 'कुछ दिनों बारिश की संभावना है: छाता रखें और अंदर घूमने का विकल्प तैयार रखें।',
    hot: 'गर्मी रहेगी: पानी और सनस्क्रीन साथ रखें, बाहर घूमना सुबह करें।',
    cold: 'ठंड रहेगी: गर्म कपड़े साथ रखें।',
    noForecast: 'पूर्वानुमान अभी उपलब्ध नहीं है। यात्रा से पहले दोबारा देखें।',
    plan: 'अपना प्लान और पैकिंग चेकलिस्ट खोलें',
    noStay: 'अभी तक रुकने की जगह बुक नहीं की?',
    findStay: 'अपनी तारीखों के होटल देखें',
    footer: 'आपको यह ईमेल इसलिए मिला क्योंकि आपने यह यात्रा CitiTour पर सेव की है।',
    unsubscribe: 'यात्रा रिमाइंडर बंद करें'
  }
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Forecast days that fall within the trip, plus advice. */
const tripForecast = async (itinerary) => {
  if (!openWeatherService.isOpenWeatherAvailable()) return { days: [], advice: [] };
  const city = (itinerary.destination && itinerary.destination.name) || itinerary.request.destination;
  try {
    const forecast = await openWeatherService.getForecast(city, 'metric');
    const days = (forecast.dailyForecasts || []).filter((day) =>
      day.date >= itinerary.request.checkIn && day.date <= itinerary.request.checkOut);
    const advice = [];
    if (days.some((day) => day.precipitationProbability >= 50)) advice.push('rain');
    if (days.some((day) => day.maxTemperature >= 35)) advice.push('hot');
    if (days.some((day) => day.minTemperature <= 8)) advice.push('cold');
    return { days, advice };
  } catch (error) {
    logger.warn('Reminder forecast failed', { city, error: error.message });
    return { days: [], advice: [] };
  }
};

const buildReminderEmail = (itinerary, user, forecast) => {
  const lang = itinerary.request.language === 'hi' ? 'hi' : 'en';
  const t = TEXT[lang];
  const destination = (itinerary.destination && itinerary.destination.name) || itinerary.request.destination;
  const trip = { destination, date: itinerary.request.checkIn };
  const tripLink = `${appUrl()}/trip/${itinerary.publicId}`;
  const stayLink = hotelBookingLink({
    city: destination,
    checkIn: itinerary.request.checkIn,
    checkOut: itinerary.request.checkOut,
    adults: itinerary.request.travellers
  });
  const unsubscribe = unsubscribeLink(user._id);

  const forecastLines = forecast.days.map((day) =>
    `${day.date}: ${day.description}, ${Math.round(day.minTemperature)}–${Math.round(day.maxTemperature)}°C, rain ${Math.round(day.precipitationProbability)}%`);
  const adviceLines = forecast.advice.map((key) => t[key]);

  const text = [
    t.hello(user.name),
    '',
    t.intro(trip),
    '',
    `${t.weather}:`,
    ...(forecastLines.length ? forecastLines : [t.noForecast]),
    ...adviceLines,
    '',
    `${t.plan}: ${tripLink}`,
    '',
    `${t.noStay} ${t.findStay}: ${stayLink}`,
    '',
    t.footer,
    `${t.unsubscribe}: ${unsubscribe}`
  ].join('\n');

  const button = (href, label) =>
    `<a href="${href}" style="background:#86B817;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a>`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#212529">
  <h2 style="color:#86B817;margin-bottom:4px">CitiTour</h2>
  <p>${escapeHtml(t.hello(user.name))}</p>
  <p>${escapeHtml(t.intro(trip))}</p>
  <h3>${escapeHtml(t.weather)}</h3>
  ${forecastLines.length
    ? `<ul>${forecastLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : `<p>${escapeHtml(t.noForecast)}</p>`}
  ${adviceLines.map((line) => `<p style="background:#fff3bf;padding:8px;border-radius:6px">${escapeHtml(line)}</p>`).join('')}
  <p>${button(tripLink, t.plan)}</p>
  <p>${escapeHtml(t.noStay)} <a href="${stayLink}">${escapeHtml(t.findStay)}</a></p>
  <p style="color:#868e96;font-size:12px;margin-top:24px">${escapeHtml(t.footer)}
    <a href="${unsubscribe}" style="color:#868e96">${escapeHtml(t.unsubscribe)}</a></p>
</div>`;

  return { subject: t.subject(trip), text, html };
};

// ---------------------------------------------------------------- job

/**
 * Send reminders for saved trips starting in DAYS_BEFORE days.
 * @returns {Promise<{checked:number, sent:number, skipped:number}>}
 */
const runPreTripReminders = async (now = Date.now()) => {
  const target = istDate(DAYS_BEFORE, now);
  const candidates = await Itinerary.find({
    userId: { $ne: null },
    'request.checkIn': target,
    'reminders.preTripSentAt': null
  }).select('_id').limit(500).lean();

  let sent = 0;
  let skipped = 0;
  for (const { _id } of candidates) {
    // Claim first: only one instance ever handles a given trip
    const itinerary = await Itinerary.findOneAndUpdate(
      { _id, 'reminders.preTripSentAt': null },
      { $set: { 'reminders.preTripSentAt': new Date() } },
      { new: true }
    );
    if (!itinerary) continue;

    const user = await User.findById(itinerary.userId).select('name email isActive notifications').lean();
    if (!user || !user.isActive || (user.notifications && user.notifications.tripReminders === false)) {
      skipped++;
      continue;
    }

    const forecast = await tripForecast(itinerary);
    const email = buildReminderEmail(itinerary, user, forecast);
    const ok = await sendMailSafe({ to: user.email, ...email });
    if (ok) sent++; else skipped++;
  }

  if (candidates.length) {
    logger.info('Pre-trip reminders run', { target, checked: candidates.length, sent, skipped });
  }
  return { checked: candidates.length, sent, skipped };
};

/** Start the hourly job (only when reminders are enabled). */
const startReminderScheduler = () => {
  if (!remindersEnabled()) {
    logger.info('Trip reminders disabled (set REMINDERS_ENABLED=true to enable)');
    return null;
  }
  const run = () => runPreTripReminders().catch((error) => logger.error('Reminder job failed', { error: error.message }));
  const first = setTimeout(run, 60 * 1000);
  const timer = setInterval(run, 60 * 60 * 1000);
  first.unref();
  timer.unref();
  logger.info('Trip reminders scheduled (hourly)');
  return timer;
};

module.exports = {
  runPreTripReminders,
  startReminderScheduler,
  buildReminderEmail,
  unsubscribeToken,
  verifyUnsubscribe,
  istDate,
  remindersEnabled
};
