const logger = require('../config/logger');
const { getTransporter } = require('../config/mailer');

const sendEmail = async (req, res) => {
  const { name, email, subject, message } = req.body;
  const mailer = getTransporter();
  const recipient = process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER;

  if (!mailer || !recipient) {
    logger.error('Contact email is not configured (EMAIL_USER/EMAIL_PASS/RECIPIENT_EMAIL)');
    return res.status(503).json({ success: false, message: 'Messaging is temporarily unavailable.' });
  }

  try {
    await mailer.sendMail({
      // Send from our own mailbox; the visitor's address goes in Reply-To so
      // providers don't reject the message as spoofed.
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || recipient,
      replyTo: `${name} <${email}>`,
      to: recipient,
      subject: `[CitiTour contact] ${subject || 'New message'}`,
      text: `From: ${name} <${email}>\n\n${message}`
    });
    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    logger.error('Failed to send contact email', { error: error.message });
    return res.status(502).json({ success: false, message: 'Failed to send email. Please try again later.' });
  }
};

module.exports = { sendEmail };
