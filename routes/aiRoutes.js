const express = require('express');
const { handleQuery } = require('../controllers/aiController');
const { fetchHotels } = require('../controllers/searchResultsController');
const router = express.Router();

router.post('/query', handleQuery);
router.post('/recommendlocation',fetchHotels);

module.exports = router;
