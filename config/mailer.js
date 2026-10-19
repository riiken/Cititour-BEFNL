const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Shared SMTP transport. Settings: EMAIL_HOST / EMAIL_PORT / EMAIL_USER /
 * EMAIL_PASS (the older RECIPIENT_EMAIL + APP_PASS Gmail setup still works).
 * Returns null when email is not configured.
 */
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER || process.env.RECIPIENT_EMAIL;
  const pass = process.env.EMAIL_PASS || process.env.APP_PASS;
  if (!user || !pass) return null;

  const port = Number(process.env.EMAIL_PORT || 587);
  transporter = nodemailer.createTransport(
    process.env.EMAIL_HOST
      ? { host: process.env.EMAIL_HOST, port, secure: port === 465, auth: { user, pass } }
      : { service: 'gmail', auth: { user, pass } }
  );
  return transporter;
};

const fromAddress = () => process.env.EMAIL_FROM || process.env.EMAIL_USER || process.env.RECIPIENT_EMAIL;

/**
 * Send an email without ever throwing (notifications must not break requests).
 * @returns {Promise<boolean>} whether it was sent
 */
const sendMailSafe = async ({ to, subject, text, html, replyTo }) => {
  const mailer = getTransporter();
  if (!mailer || !to) {
    logger.info('Email skipped (not configured or no recipient)', { subject });
    return false;
  }
  try {
    await mailer.sendMail({ from: `CitiTour <${fromAddress()}>`, to, subject, text, html, replyTo });
    return true;
  } catch (error) {
    logger.warn('Email failed', { subject, error: error.message });
    return false;
  }
};

/** Public web app URL for links in emails. */
const appUrl = () => (
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL_PROD || process.env.APP_URL
    : process.env.FRONTEND_URL || 'http://localhost:4200'
) || 'https://cititour.onrender.com';

const adminEmails = () => String(process.env.ADMIN_EMAILS || '')
  .split(',').map((email) => email.trim()).filter(Boolean);

module.exports = { getTransporter, sendMailSafe, fromAddress, appUrl, adminEmails };
