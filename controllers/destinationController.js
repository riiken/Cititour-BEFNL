const dataAggregationService = require('../services/dataAggregationService');
const wikipediaService = require('../services/wikipediaService');
const openWeatherService = require('../services/openWeatherService');
const unsplashService = require('../services/unsplashService');
const logger = require('../config/logger');
const { createTtlCache } = require('../utils/ttlCache');

// Aggregated destination data changes slowly; weather is the most volatile
// part and 30 minutes is within OpenWeather's own update interval.
const cache = createTtlCache({ ttlMs: Number(process.env.DESTINATION_CACHE_MINUTES || 30) * 60 * 1000 });
const cacheKey = (...parts) => parts.map((part) => String(part).toLowerCase().trim()).join('|');

/**
 * Get comprehensive destination data
 * GET /api/destinations/:name
 */
const getDestination = async (req, res, next) => {
  try {
    const { name } = req.params;
    const {
      includeWeather = 'true',
      includeImages = 'true',
      includeForecast = 'true',
      includeRelated = 'false',
      units = 'metric'
    } = req.query;

    logger.info('Fetching destination data:', {
      name,
      includeWeather,
      includeImages
    });

    const options = {
      includeWeather: includeWeather === 'true',
      includeImages: includeImages === 'true',
      includeForecast: includeForecast === 'true',
      includeRelated: includeRelated === 'true',
      units: units
    };

    const data = await cache.wrap(cacheKey('destination', name, JSON.stringify(options)), () =>
      dataAggregationService.getDestinationData(name, options));

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get destination error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get travel planning data for destination
 * GET /api/destinations/:name/travel
 */
const getTravelPlanningData = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { units = 'metric' } = req.query;

    logger.info('Fetching travel planning data:', { name, units });

    const data = await cache.wrap(cacheKey('travel', name, units), () =>
      dataAggregationService.getTravelPlanningData(name, units));

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get travel planning data error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get quick overview of destination
 * GET /api/destinations/:name/quick
 */
const getQuickOverview = async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.info('Fetching quick overview:', { name });

    const data = await cache.wrap(cacheKey('quick', name), () =>
      dataAggregationService.getQuickOverview(name));

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get quick overview error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Search destinations
 * GET /api/destinations/search?q=query&limit=5
 */
const searchDestinations = async (req, res, next) => {
  try {
    const { q: query, limit = 5 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    logger.info('Searching destinations:', { query, limit });

    const results = await cache.wrap(cacheKey('search', query, limit), () =>
      dataAggregationService.searchDestinations(query, parseInt(limit)));

    res.json({
      success: true,
      data: results,
      count: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Search destinations error:', {
      query: req.query.q,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get destination images
 * GET /api/destinations/:name/images?count=10
 */
const getDestinationImages = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { count = 10 } = req.query;

    logger.info('Fetching destination images:', { name, count });

    const images = await cache.wrap(cacheKey('images', name, count), () =>
      dataAggregationService.getDestinationImages(name, parseInt(count)));

    res.json({
      success: true,
      data: images,
      count: images.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get destination images error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get current weather for destination
 * GET /api/destinations/:name/weather?units=metric
 */
const getDestinationWeather = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { units = 'metric' } = req.query;

    if (!openWeatherService.isOpenWeatherAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Weather service not available'
      });
    }

    logger.info('Fetching destination weather:', { name, units });

    const weather = await cache.wrap(cacheKey('weather', name, units), () =>
      openWeatherService.getCurrentWeather(name, units));

    res.json({
      success: true,
      data: weather,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get destination weather error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get weather forecast for destination
 * GET /api/destinations/:name/forecast?units=metric
 */
const getDestinationForecast = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { units = 'metric' } = req.query;

    if (!openWeatherService.isOpenWeatherAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Weather service not available'
      });
    }

    logger.info('Fetching destination forecast:', { name, units });

    const forecast = await cache.wrap(cacheKey('forecast', name, units), () =>
      openWeatherService.getForecast(name, units));

    res.json({
      success: true,
      data: forecast.dailyForecasts,
      city: forecast.city,
      country: forecast.country,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get destination forecast error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

/**
 * Get Wikipedia info for destination
 * GET /api/destinations/:name/info
 */
const getDestinationInfo = async (req, res, next) => {
  try {
    const { name } = req.params;

    logger.info('Fetching destination info:', { name });

    // Search first to get exact title
    const searchResults = await wikipediaService.searchDestination(name, 1);

    if (!searchResults || searchResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Destination not found'
      });
    }

    const title = searchResults[0].title;

    // Get detailed info
    const [summary, details] = await Promise.all([
      wikipediaService.getDestinationSummary(title),
      wikipediaService.getDestinationDetails(title)
    ]);

    res.json({
      success: true,
      data: {
        title: summary.title,
        description: summary.extract,
        fullContent: details.content,
        image: summary.image,
        url: summary.url,
        coordinates: details.coordinates,
        categories: details.categories
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get destination info error:', {
      name: req.params.name,
      error: error.message
    });
    next(error);
  }
};

module.exports = {
  getDestination,
  getTravelPlanningData,
  getQuickOverview,
  searchDestinations,
  getDestinationImages,
  getDestinationWeather,
  getDestinationForecast,
  getDestinationInfo
};
