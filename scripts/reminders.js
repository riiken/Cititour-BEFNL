/**
 * Run the pre-trip reminder job once: `npm run reminders`.
 * Sends real emails when email is configured. Uses MONGODB_URI from .env.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { runPreTripReminders } = require('../services/reminderService');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await runPreTripReminders();
  console.log('Pre-trip reminders:', result);
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
