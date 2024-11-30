const nodemailer = require('nodemailer');
require('dotenv').config();
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.RECIPIENT_EMAIL,  // Replace with your Gmail address
      pass: process.env.APP_PASS// Replace with your Gmail app password
    }
  });

const sendEmail = async (req, res) => {
    const { name, email, subject, message } = req.body;
  
    const mailOptions = {
      from: email,
      to: process.env.RECIPIENT_EMAIL, // Replace with your recipient's email
      subject: subject,
      text: `Hey This is : ${name}\n\n${message}`,
    };
  
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ message: 'Failed to send email', error });
      }
      return res.status(200).json({ message: 'Email sent successfully', info });
    });
}

module.exports = {sendEmail}