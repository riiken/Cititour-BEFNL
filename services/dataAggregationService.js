const wikipediaService = require('./wikipediaService');
const openWeatherService = require('./openWeatherService');
const unsplashService = require('./unsplashService');
const logger = require('../config/logger');
const { callAiApi } = require('./aiService');

/**
 * Data Aggregation Service
 * Combines multiple FREE data sources for comprehensive travel information
 *
 * Data Sources:
 * - Wikipedia: Destination info, descriptions, history (FREE, no key)
 * - OpenWeather: Weather data, forecasts (FREE, 60 calls/min)
 * - Unsplash: High-quality images (FREE, 50 calls/hour)
 * - Pexels: Alternative images (already integrated)
 *
 * This service provides unified methods to fetch all travel data in one call.
 */

/**
 * Get comprehensive destination data
 * Combines information from all available sources
 * @param {string} destination - Destination name (e.g., "Tokyo", "Paris")
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeWeather - Include weather data (default: true)
 * @param {boolean} options.includeImages - Include images (default: true)
 * @param {boolean} options.includeForecast - Include weather forecast (default: true)
 * @param {boolean} options.includeRelated - Include related destinations (default: false)
 * @param {string} options.units - Temperature units: 'metric' or 'imperial' (default: 'metric')
 * @returns {Promise<Object>} Comprehensive destination data
 */
const getDestinationData = async (destination, options = {}) => {
  const {
    includeWeather = true,
    includeImages = true,
    includeForecast = true,
    includeRelated = false,
    units = 'metric'
  } = options;

  try {
    logger.info('Fetching comprehensive destination data:', { destination, options });

    const result = {
      destination: destination,
      timestamp: new Date().toISOString(),
      sources: [],
      data: {}
    };

    // Fetch data from all sources in parallel
    const promises = [];

    // 1. Wikipedia - Destination info (always fetch)
    promises.push(
      wikipediaService.searchDestination(destination, 1)
        .then(async (searchResults) => {
          if (searchResults && searchResults.length > 0) {
            const summary = await wikipediaService.getDestinationSummary(searchResults[0].title);
            const details = await wikipediaService.getDestinationDetails(searchResults[0].title);

            result.sources.push('Wikipedia');
            result.data.info = {
              title: summary.title,
              description: summary.extract,
              fullContent: details.content,
              url: summary.url,
              image: summary.image,
              coordinates: details.coordinates,
              categories: details.categories,
              source: 'Wikipedia'
            };

            return details.coordinates;
          }
          return null;
        })
        .catch((error) => {
          logger.warn('Wikipedia fetch failed:', error.message);
          result.data.info = null;
          return null;
        })
    );

    // 2. Weather - Current weather and forecast
    if (includeWeather && openWeatherService.isOpenWeatherAvailable()) {
      promises.push(
        openWeatherService.getCurrentWeather(destination, units)
          .then((weather) => {
            result.sources.push('OpenWeather');
            result.data.weather = weather;
            return weather.coordinates;
          })
          .catch((error) => {
            logger.warn('OpenWeather fetch failed:', error.message);
            result.data.weather = null;
            return null;
          })
      );

      if (includeForecast) {
        promises.push(
          openWeatherService.getForecast(destination, units)
            .then((forecast) => {
              result.data.forecast = forecast.dailyForecasts;
              return null;
            })
            .catch((error) => {
              logger.warn('Weather forecast fetch failed:', error.message);
              result.data.forecast = null;
              return null;
            })
        );
      }
    }

    // 3. Images - High-quality destination photos
    if (includeImages && unsplashService.isUnsplashAvailable()) {
      promises.push(
        unsplashService.getDestinationPhotos(destination, 5)
          .then((photos) => {
            result.sources.push('Unsplash');
            result.data.images = photos;
            return null;
          })
          .catch((error) => {
            logger.warn('Unsplash fetch failed:', error.message);
            result.data.images = [];
            return null;
          })
      );
    }

    // Wait for all parallel requests
    const coordinates = await Promise.all(promises);

    // 4. Related destinations (optional, uses Wikipedia)
    if (includeRelated && result.data.info && result.data.info.title) {
      try {
        const related = await wikipediaService.getRelatedDestinations(result.data.info.title, 5);
        result.data.relatedDestinations = related;
      } catch (error) {
        logger.warn('Related destinations fetch failed:', error.message);
        result.data.relatedDestinations = [];
      }
    }

    // 5. If Wikipedia has coordinates but weather failed, try weather by coords
    const wikiCoords = result.data.info && result.data.info.coordinates;
    if (includeWeather && !result.data.weather && wikiCoords && wikiCoords.lat && wikiCoords.lon) {
      try {
        result.data.weather = await openWeatherService.getCurrentWeatherByCoords(
          wikiCoords.lat,
          wikiCoords.lon,
          units
        );
        if (!result.sources.includes('OpenWeather')) {
          result.sources.push('OpenWeather');
        }
      } catch (error) {
        logger.warn('Weather by coords fetch failed:', error.message);
      }
    }

    // Calculate completeness score
    result.completeness = calculateCompleteness(result);

    logger.info('Destination data aggregated successfully:', {
      destination,
      sources: result.sources.length,
      completeness: `${result.completeness}%`
    });

    return result;

  } catch (error) {
    logger.error('Data aggregation error:', {
      destination,
      error: error.message
    });
    throw new Error('Failed to aggregate destination data');
  }
};

/**
 * Get quick destination overview (minimal data for fast response)
 * @param {string} destination - Destination name
 * @returns {Promise<Object>} Quick overview data
 */
const getQuickOverview = async (destination) => {
  try {
    logger.info('Fetching quick overview:', { destination });

    const result = {
      destination: destination,
      timestamp: new Date().toISOString()
    };

    // Fetch only essential data in parallel
    const [searchResults, weather] = await Promise.allSettled([
      wikipediaService.searchDestination(destination, 1),
      openWeatherService.isOpenWeatherAvailable()
        ? openWeatherService.getCurrentWeather(destination, 'metric')
        : Promise.reject(new Error('OpenWeather not available'))
    ]);

    // Wikipedia summary
    if (searchResults.status === 'fulfilled' && searchResults.value.length > 0) {
      const summary = await wikipediaService.getDestinationSummary(searchResults.value[0].title);
      result.summary = {
        title: summary.title,
        description: summary.extract,
        image: summary.image,
        url: summary.url
      };
    }

    // Current weather
    if (weather.status === 'fulfilled') {
      result.weather = {
        temperature: weather.value.temperature,
        description: weather.value.description,
        icon: weather.value.iconUrl
      };
    }

    logger.info('Quick overview retrieved:', { destination });

    return result;

  } catch (error) {
    logger.error('Quick overview error:', {
      destination,
      error: error.message
    });
    throw new Error('Failed to get quick overview');
  }
};

/**
 * Get travel-optimized data for trip planning
 * Includes weather recommendations and best times to visit
 * @param {string} destination - Destination name
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} Travel-optimized data
 */
const getTravelPlanningData = async (destination, units = 'metric') => {
  try {
    logger.info('Fetching travel planning data:', { destination });

    // Get comprehensive data
    const data = await getDestinationData(destination, {
      includeWeather: true,
      includeImages: true,
      includeForecast: true,
      includeRelated: true,
      units: units
    });
const ndata = await callAiApi(`Plan a trip for ${destination}`);
    console.log('📊 AI Data Type:', typeof ndata);
    console.log('📊 AI Data:', JSON.stringify(ndata, null, 2));

    // Enhance with travel-specific insights
    const travelData = {
      destination: destination,
      overview: {
        title: data.data.info ? data.data.info.title : destination,
        description: data.data.info ? data.data.info.description : null,
        heroImage: data.data.images && data.data.images.length > 0
          ? data.data.images[0].urls.regular
          : (data.data.info ? data.data.info.image : null)
      },
      currentConditions: data.data.weather ? {
        temperature: data.data.weather.temperature,
        feelsLike: data.data.weather.feelsLike,
        description: data.data.weather.description,
        humidity: data.data.weather.humidity,
        windSpeed: data.data.weather.windSpeed,
        icon: data.data.weather.iconUrl
      } : null,
      weatherForecast: data.data.forecast || [],
      recommendations: generateTravelRecommendations(data),
      aiRecommendation:ndata,
      bestTimeToVisit: determineBestTimeToVisit(data.data.forecast),
      thingsToDo: data.data.info ? extractActivitiesFromCategories(data.data.info.categories) : [],
      nearbyDestinations: data.data.relatedDestinations || [],
      imageGallery: data.data.images ? data.data.images.map(img => ({
        url: img.urls.regular,
        thumb: img.urls.thumb,
        description: img.description,
        photographer: img.photographer.name,
        attribution: unsplashService.getPhotoAttributionHTML(img)
      })) : [],
      coordinates: data.data.info ? data.data.info.coordinates : null,
      sources: data.sources,
      completeness: data.completeness,
      timestamp: data.timestamp
    };

    logger.info('Travel planning data compiled:', {
      destination,
      completeness: `${travelData.completeness}%`
    });

    return travelData;

  } catch (error) {
    logger.error('Travel planning data error:', {
      destination,
      error: error.message
    });
    throw error;
  }
};

/**
 * Search destinations with preview data
 * @param {string} query - Search query
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Array of destination previews
 */
const searchDestinations = async (query, limit = 5) => {
  try {
    logger.info('Searching destinations:', { query, limit });

    // Search Wikipedia
    const searchResults = await wikipediaService.searchDestination(query, limit);

    // Enhance each result with quick data
    const enhancedResults = await Promise.all(
      searchResults.map(async (result) => {
        try {
          // Get summary
          const summary = await wikipediaService.getDestinationSummary(result.title);

          // Try to get weather if available
          let weather = null;
          if (openWeatherService.isOpenWeatherAvailable()) {
            try {
              const weatherData = await openWeatherService.getCurrentWeather(result.title, 'metric');
              weather = {
                temperature: weatherData.temperature,
                description: weatherData.description,
                icon: weatherData.iconUrl
              };
            } catch (error) {
              // Weather not available for this location
            }
          }

          return {
            title: result.title,
            description: result.description || summary.extract.substring(0, 200) + '...',
            image: summary.image,
            url: result.url,
            weather: weather,
            source: 'Wikipedia'
          };
        } catch (error) {
          return result; // Return basic result if enhancement fails
        }
      })
    );

    logger.info('Destinations search completed:', {
      query,
      resultsCount: enhancedResults.length
    });

    return enhancedResults;

  } catch (error) {
    logger.error('Destination search error:', {
      query,
      error: error.message
    });
    throw new Error('Failed to search destinations');
  }
};

/**
 * Get image collection for a destination
 * Combines images from Unsplash with fallback options
 * @param {string} destination - Destination name
 * @param {number} count - Number of images
 * @returns {Promise<Array>} Array of images
 */
const getDestinationImages = async (destination, count = 10) => {
  try {
    logger.info('Fetching destination images:', { destination, count });

    const images = [];

    // Try Unsplash first
    if (unsplashService.isUnsplashAvailable()) {
      try {
        const unsplashPhotos = await unsplashService.getDestinationPhotos(destination, count);
        images.push(...unsplashPhotos.map(photo => ({
          url: photo.urls.regular,
          thumb: photo.urls.thumb,
          full: photo.urls.full,
          description: photo.description,
          photographer: photo.photographer.name,
          source: 'Unsplash',
          attribution: unsplashService.getPhotoAttributionHTML(photo),
          width: photo.width,
          height: photo.height
        })));
      } catch (error) {
        logger.warn('Unsplash images failed:', error.message);
      }
    }

    // Fallback to Wikipedia images if needed
    if (images.length < count) {
      try {
        const wikiImages = await wikipediaService.getDestinationImages(destination, count - images.length);
        images.push(...wikiImages.map(url => ({
          url: url,
          thumb: url,
          full: url,
          source: 'Wikipedia',
          attribution: 'Wikipedia'
        })));
      } catch (error) {
        logger.warn('Wikipedia images failed:', error.message);
      }
    }

    logger.info('Destination images retrieved:', {
      destination,
      count: images.length
    });

    return images;

  } catch (error) {
    logger.error('Destination images error:', {
      destination,
      error: error.message
    });
    return [];
  }
};

/**
 * Calculate data completeness percentage
 * @param {Object} result - Aggregated data result
 * @returns {number} Completeness percentage (0-100)
 */
const calculateCompleteness = (result) => {
  let score = 0;
  let maxScore = 0;

  // Info (Wikipedia) - 30 points
  maxScore += 30;
  if (result.data.info) {
    score += 30;
  }

  // Weather - 25 points
  maxScore += 25;
  if (result.data.weather) {
    score += 25;
  }

  // Forecast - 20 points
  maxScore += 20;
  if (result.data.forecast && result.data.forecast.length > 0) {
    score += 20;
  }

  // Images - 25 points
  maxScore += 25;
  if (result.data.images && result.data.images.length > 0) {
    score += 25;
  }

  return Math.round((score / maxScore) * 100);
};

/**
 * Generate travel recommendations based on aggregated data
 * @param {Object} data - Aggregated destination data
 * @returns {Array} Array of recommendation strings
 */
const generateTravelRecommendations = (data) => {
  const recommendations = [];

  // Weather-based recommendations
  if (data.data.weather) {
    const temp = data.data.weather.temperature;
    const desc = data.data.weather.description.toLowerCase();

    if (temp < 10) {
      recommendations.push('Pack warm clothing - temperatures are quite cool');
    } else if (temp > 30) {
      recommendations.push('Stay hydrated and wear sunscreen - very warm weather');
    } else if (temp >= 20 && temp <= 28) {
      recommendations.push('Perfect weather for sightseeing and outdoor activities');
    }

    if (desc.includes('rain') || desc.includes('drizzle')) {
      recommendations.push('Bring an umbrella - rain expected');
    } else if (desc.includes('clear') || desc.includes('sun')) {
      recommendations.push('Great conditions for photography and outdoor exploration');
    }
  }

  // Forecast-based recommendations
  if (data.data.forecast && data.data.forecast.length > 0) {
    const avgTemp = data.data.forecast.reduce((sum, day) => sum + day.avgTemperature, 0) / data.data.forecast.length;
    const maxPrecip = Math.max(...data.data.forecast.map(d => d.precipitationProbability));

    if (maxPrecip > 50) {
      recommendations.push('Rain likely this week - plan indoor activities as backup');
    }

    if (avgTemp > 25) {
      recommendations.push('Warm week ahead - perfect for beaches and water activities');
    }
  }

  // Category-based recommendations
  if (data.data.info && data.data.info.categories) {
    const categories = data.data.info.categories.map(c => c.toLowerCase()).join(' ');

    if (categories.includes('historic') || categories.includes('heritage')) {
      recommendations.push('Rich historical heritage - consider guided tours');
    }
    if (categories.includes('beach') || categories.includes('coast')) {
      recommendations.push('Beautiful coastal area - don\'t forget beach essentials');
    }
    if (categories.includes('mountain') || categories.includes('hiking')) {
      recommendations.push('Great for hiking - bring appropriate footwear');
    }
    if (categories.includes('food') || categories.includes('cuisine')) {
      recommendations.push('Renowned culinary destination - try local specialties');
    }
  }

  return recommendations.slice(0, 5); // Return top 5 recommendations
};

/**
 * Determine best time to visit based on forecast
 * @param {Array} forecast - Weather forecast array
 * @returns {Object} Best time information
 */
const determineBestTimeToVisit = (forecast) => {
  if (!forecast || forecast.length === 0) {
    return null;
  }

  // Score each day
  const scoredDays = forecast.map(day => {
    let score = 100;

    // Temperature scoring (ideal: 20-28°C)
    const temp = day.avgTemperature;
    if (temp < 15) score -= 20;
    else if (temp < 20) score -= 10;
    else if (temp > 30) score -= 15;
    else if (temp > 35) score -= 30;

    // Precipitation scoring
    score -= day.precipitationProbability * 0.5;

    return {
      date: day.date,
      score: Math.max(0, score),
      temperature: day.avgTemperature,
      description: day.description,
      precipChance: day.precipitationProbability
    };
  });

  // Find best day
  const bestDay = scoredDays.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  return {
    bestDay: bestDay.date,
    score: Math.round(bestDay.score),
    reason: generateBestDayReason(bestDay),
    alternatives: scoredDays
      .filter(d => d.date !== bestDay.date)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(d => d.date)
  };
};

/**
 * Generate reason for best day selection
 * @param {Object} day - Scored day object
 * @returns {string} Reason string
 */
const generateBestDayReason = (day) => {
  const reasons = [];

  if (day.temperature >= 20 && day.temperature <= 28) {
    reasons.push('ideal temperature');
  }
  if (day.precipChance < 20) {
    reasons.push('low chance of rain');
  }
  if (day.description.toLowerCase().includes('clear') || day.description.toLowerCase().includes('sun')) {
    reasons.push('clear skies');
  }

  return reasons.length > 0
    ? `Best conditions: ${reasons.join(', ')}`
    : 'Most favorable weather conditions';
};

/**
 * Extract activity suggestions from Wikipedia categories
 * @param {Array} categories - Wikipedia categories
 * @returns {Array} Array of activity suggestions
 */
const extractActivitiesFromCategories = (categories) => {
  if (!categories || categories.length === 0) {
    return [];
  }

  const activities = [];
  const categoryText = categories.map(c => c.toLowerCase()).join(' ');

  const activityMap = {
    'museum': 'Visit museums and cultural centers',
    'historic': 'Explore historical landmarks',
    'beach': 'Enjoy beach activities and water sports',
    'mountain': 'Go hiking and mountain climbing',
    'park': 'Visit parks and gardens',
    'shopping': 'Experience local shopping districts',
    'food': 'Try local cuisine and restaurants',
    'nightlife': 'Experience local nightlife',
    'art': 'Visit art galleries and exhibitions',
    'architecture': 'Admire architectural landmarks',
    'nature': 'Explore natural attractions',
    'religious': 'Visit religious and spiritual sites'
  };

  for (const [keyword, activity] of Object.entries(activityMap)) {
    if (categoryText.includes(keyword) && !activities.includes(activity)) {
      activities.push(activity);
    }
  }

  return activities.slice(0, 6); // Return top 6 activities
};

module.exports = {
  getDestinationData,
  getQuickOverview,
  getTravelPlanningData,
  searchDestinations,
  getDestinationImages,
  calculateCompleteness
};
