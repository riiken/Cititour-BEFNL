const express = require('express');
const connectDB = require('./config/db');
const aiRoutes = require('./routes/aiRoutes');
const cors = require('cors')

require('dotenv').config();

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// Connect to DB
connectDB();

// Routes
app.use('/api/ai', aiRoutes);

module.exports = app;
