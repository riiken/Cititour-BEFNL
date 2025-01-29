const express = require('express');
const { handleQuery } = require('../controllers/aiController');
const { fetchHotels } = require('../controllers/searchResultsController');
const { sendEmail } = require('../controllers/sendEmailController');
const { getPopularLocation, fetchImageFromPexels } = require('../controllers/popularDestinationController');
const router = express.Router();

router.post('/query', handleQuery);
router.post('/recommendlocation',fetchHotels);
router.post('/sendEmail',sendEmail);
router.post('/popularLocation',fetchImageFromPexels);

module.exports = router;
