const express = require('express');
const connectDB = require('./config/db');
const aiRoutes = require('./routes/aiRoutes');
const cors = require('cors')

require('dotenv').config();

const app = express();

const allowedOrigins = [
    'http://localhost:4200',
    'https://cititour.onrender.com'
  ];

  const corsOptions = {
    origin: function (origin, callback) {
        console.log(origin);
      if (allowedOrigins.indexOf(origin) !== -1) { // !origin for testing in Postman
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  };
// Middleware
app.use(cors(corsOptions)); // Enable CORS for all routes
app.use(express.json());

// Connect to DB
connectDB();

// Routes
app.use('/api/ai', aiRoutes);

module.exports = app;
