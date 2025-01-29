const express = require('express');
const connectDB = require('./config/db');
const aiRoutes = require('./routes/aiRoutes');
const cors = require('cors');

require('dotenv').config();

const app = express();

const allowedOrigins = [
    'http://localhost:4200',          // Angular Development
    'https://cititour.onrender.com',  // Deployed Web App
    'capacitor://localhost',          // Android/iOS App
    'http://localhost'                // Localhost for mobile testing
];

const corsOptions = {
    origin: function (origin, callback) {
        console.log("Incoming Request Origin:", origin);

        if (!origin) {
            // Allow if request is from the Capacitor app (which has no origin)
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } 
        
        return callback(new Error('Not allowed by CORS'));
    }
};

// Middleware
app.use(cors(corsOptions)); // Enable CORS for all routes
app.use(express.json());

// Middleware to allow only requests from Capacitor app (checks User-Agent)
app.use((req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';

    if (!req.headers.origin && userAgent.includes('Capacitor')) {
        return next();
    }

    next();
});

// Connect to DB
connectDB();

// Routes
app.use('/api/ai', aiRoutes);

module.exports = app;
