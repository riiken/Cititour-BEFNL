const axios = require('axios');
const logger = require('../config/logger');

/**
 * OpenWeather API Service - FREE Weather Data
 * Free Tier: 60 calls/minute, 1,000,000 calls/month
 * No credit card required!
 * Get your FREE API key: https://openweathermap.org/api
 */

const OPENWEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

/**
 * Check if OpenWeather API is configured
 * @returns {boolean}
 */
const isOpenWeatherAvailable = () => {
  return !!(OPENWEATHER_API_KEY && OPENWEATHER_API_KEY !== 'your_openweather_api_key_here');
};

/**
 * Get current weather by city name
 * @param {string} city - City name (e.g., "Tokyo", "Paris")
 * @param {string} units - Temperature units: 'metric' (Celsius), 'imperial' (Fahrenheit), 'standard' (Kelvin)
 * @returns {Promise<Object>} Current weather data
 */
const getCurrentWeather = async (city, units = 'metric') => {
  try {
    if (!isOpenWeatherAvailable()) {
      throw new Error('OpenWeather API key not configured');
    }

    const response = await axios.get(`${OPENWEATHER_API_URL}/weather`, {
      params: {
        q: city,
        appid: OPENWEATHER_API_KEY,
        units: units
      },
      timeout: 5000
    });

    const data = response.data;

    const weather = {
      city: data.name,
      country: data.sys.country,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      description: data.weather[0].description,
      main: data.weather[0].main,
      icon: data.weather[0].icon,
      iconUrl: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      clouds: data.clouds.all,
      visibility: data.visibility,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      timezone: data.timezone,
      coordinates: {
        lat: data.coord.lat,
        lon: data.coord.lon
      },
      units: units,
      source: 'OpenWeather',
      timestamp: new Date().toISOString()
    };

    logger.info('Current weather retrieved:', {
      city,
      temperature: weather.temperature,
      description: weather.description
    });

    return weather;

  } catch (error) {
    logger.error('OpenWeather current weather error:', {
      city,
      error: error.message
    });

    if (error.response && error.response.status === 404) {
      throw new Error('City not found');
    }

    throw new Error('Failed to get current weather from OpenWeather');
  }
};

/**
 * Get current weather by coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} Current weather data
 */
const getCurrentWeatherByCoords = async (lat, lon, units = 'metric') => {
  try {
    if (!isOpenWeatherAvailable()) {
      throw new Error('OpenWeather API key not configured');
    }

    const response = await axios.get(`${OPENWEATHER_API_URL}/weather`, {
      params: {
        lat: lat,
        lon: lon,
        appid: OPENWEATHER_API_KEY,
        units: units
      },
      timeout: 5000
    });

    const data = response.data;

    const weather = {
      city: data.name,
      country: data.sys.country,
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      description: data.weather[0].description,
      main: data.weather[0].main,
      icon: data.weather[0].icon,
      iconUrl: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
      windSpeed: data.wind.speed,
      windDirection: data.wind.deg,
      clouds: data.clouds.all,
      visibility: data.visibility,
      sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
      sunset: new Date(data.sys.sunset * 1000).toISOString(),
      timezone: data.timezone,
      coordinates: {
        lat: data.coord.lat,
        lon: data.coord.lon
      },
      units: units,
      source: 'OpenWeather',
      timestamp: new Date().toISOString()
    };

    logger.info('Current weather by coords retrieved:', {
      lat,
      lon,
      city: weather.city,
      temperature: weather.temperature
    });

    return weather;

  } catch (error) {
    logger.error('OpenWeather current weather by coords error:', {
      lat,
      lon,
      error: error.message
    });
    throw new Error('Failed to get weather by coordinates from OpenWeather');
  }
};

/**
 * Get 5-day weather forecast (3-hour intervals)
 * @param {string} city - City name
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} 5-day forecast data
 */
const getForecast = async (city, units = 'metric') => {
  try {
    if (!isOpenWeatherAvailable()) {
      throw new Error('OpenWeather API key not configured');
    }

    const response = await axios.get(`${OPENWEATHER_API_URL}/forecast`, {
      params: {
        q: city,
        appid: OPENWEATHER_API_KEY,
        units: units
      },
      timeout: 5000
    });

    const data = response.data;

    // Process forecast data
    const forecasts = data.list.map(item => ({
      datetime: item.dt_txt,
      timestamp: new Date(item.dt * 1000).toISOString(),
      temperature: Math.round(item.main.temp),
      feelsLike: Math.round(item.main.feels_like),
      tempMin: Math.round(item.main.temp_min),
      tempMax: Math.round(item.main.temp_max),
      humidity: item.main.humidity,
      pressure: item.main.pressure,
      description: item.weather[0].description,
      main: item.weather[0].main,
      icon: item.weather[0].icon,
      iconUrl: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`,
      windSpeed: item.wind.speed,
      windDirection: item.wind.deg,
      clouds: item.clouds.all,
      visibility: item.visibility,
      pop: Math.round(item.pop * 100) // Probability of precipitation (%)
    }));

    // Group forecasts by day
    const dailyForecasts = groupForecastsByDay(forecasts);

    const forecast = {
      city: data.city.name,
      country: data.city.country,
      coordinates: {
        lat: data.city.coord.lat,
        lon: data.city.coord.lon
      },
      timezone: data.city.timezone,
      forecasts: forecasts,
      dailyForecasts: dailyForecasts,
      units: units,
      source: 'OpenWeather',
      timestamp: new Date().toISOString()
    };

    logger.info('5-day forecast retrieved:', {
      city,
      forecastCount: forecasts.length
    });

    return forecast;

  } catch (error) {
    logger.error('OpenWeather forecast error:', {
      city,
      error: error.message
    });

    if (error.response && error.response.status === 404) {
      throw new Error('City not found');
    }

    throw new Error('Failed to get forecast from OpenWeather');
  }
};

/**
 * Get 5-day forecast by coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} 5-day forecast data
 */
const getForecastByCoords = async (lat, lon, units = 'metric') => {
  try {
    if (!isOpenWeatherAvailable()) {
      throw new Error('OpenWeather API key not configured');
    }

    const response = await axios.get(`${OPENWEATHER_API_URL}/forecast`, {
      params: {
        lat: lat,
        lon: lon,
        appid: OPENWEATHER_API_KEY,
        units: units
      },
      timeout: 5000
    });

    const data = response.data;

    // Process forecast data
    const forecasts = data.list.map(item => ({
      datetime: item.dt_txt,
      timestamp: new Date(item.dt * 1000).toISOString(),
      temperature: Math.round(item.main.temp),
      feelsLike: Math.round(item.main.feels_like),
      tempMin: Math.round(item.main.temp_min),
      tempMax: Math.round(item.main.temp_max),
      humidity: item.main.humidity,
      pressure: item.main.pressure,
      description: item.weather[0].description,
      main: item.weather[0].main,
      icon: item.weather[0].icon,
      iconUrl: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`,
      windSpeed: item.wind.speed,
      windDirection: item.wind.deg,
      clouds: item.clouds.all,
      visibility: item.visibility,
      pop: Math.round(item.pop * 100)
    }));

    // Group forecasts by day
    const dailyForecasts = groupForecastsByDay(forecasts);

    const forecast = {
      city: data.city.name,
      country: data.city.country,
      coordinates: {
        lat: data.city.coord.lat,
        lon: data.city.coord.lon
      },
      timezone: data.city.timezone,
      forecasts: forecasts,
      dailyForecasts: dailyForecasts,
      units: units,
      source: 'OpenWeather',
      timestamp: new Date().toISOString()
    };

    logger.info('5-day forecast by coords retrieved:', {
      lat,
      lon,
      city: forecast.city,
      forecastCount: forecasts.length
    });

    return forecast;

  } catch (error) {
    logger.error('OpenWeather forecast by coords error:', {
      lat,
      lon,
      error: error.message
    });
    throw new Error('Failed to get forecast by coordinates from OpenWeather');
  }
};

/**
 * Helper function to group forecasts by day
 * @param {Array} forecasts - Array of forecast items
 * @returns {Array} Daily forecast summaries
 */
const groupForecastsByDay = (forecasts) => {
  const dailyMap = {};

  forecasts.forEach(item => {
    const date = item.datetime.split(' ')[0]; // Extract date (YYYY-MM-DD)

    if (!dailyMap[date]) {
      dailyMap[date] = {
        date: date,
        temperatures: [],
        descriptions: [],
        icons: [],
        humidity: [],
        pop: []
      };
    }

    dailyMap[date].temperatures.push(item.temperature);
    dailyMap[date].descriptions.push(item.description);
    dailyMap[date].icons.push(item.icon);
    dailyMap[date].humidity.push(item.humidity);
    dailyMap[date].pop.push(item.pop);
  });

  // Calculate daily summaries
  const dailyForecasts = Object.values(dailyMap).map(day => {
    const avgTemp = Math.round(
      day.temperatures.reduce((a, b) => a + b, 0) / day.temperatures.length
    );
    const minTemp = Math.min(...day.temperatures);
    const maxTemp = Math.max(...day.temperatures);
    const avgHumidity = Math.round(
      day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length
    );
    const maxPop = Math.max(...day.pop);

    // Most common description and icon
    const descriptionCounts = {};
    day.descriptions.forEach(desc => {
      descriptionCounts[desc] = (descriptionCounts[desc] || 0) + 1;
    });
    const mostCommonDescription = Object.keys(descriptionCounts).reduce((a, b) =>
      descriptionCounts[a] > descriptionCounts[b] ? a : b
    );

    const iconCounts = {};
    day.icons.forEach(icon => {
      iconCounts[icon] = (iconCounts[icon] || 0) + 1;
    });
    const mostCommonIcon = Object.keys(iconCounts).reduce((a, b) =>
      iconCounts[a] > iconCounts[b] ? a : b
    );

    return {
      date: day.date,
      avgTemperature: avgTemp,
      minTemperature: minTemp,
      maxTemperature: maxTemp,
      description: mostCommonDescription,
      icon: mostCommonIcon,
      iconUrl: `https://openweathermap.org/img/wn/${mostCommonIcon}@2x.png`,
      humidity: avgHumidity,
      precipitationProbability: maxPop
    };
  });

  return dailyForecasts;
};

/**
 * Get comprehensive weather data (current + forecast)
 * @param {string} city - City name
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} Complete weather data
 */
const getCompleteWeatherData = async (city, units = 'metric') => {
  try {
    if (!isOpenWeatherAvailable()) {
      throw new Error('OpenWeather API key not configured');
    }

    // Fetch both current weather and forecast in parallel
    const [current, forecast] = await Promise.all([
      getCurrentWeather(city, units),
      getForecast(city, units)
    ]);

    const completeData = {
      current: current,
      forecast: forecast.dailyForecasts,
      hourlyForecast: forecast.forecasts.slice(0, 24), // Next 24 hours (8 intervals)
      city: current.city,
      country: current.country,
      coordinates: current.coordinates,
      units: units,
      source: 'OpenWeather',
      timestamp: new Date().toISOString()
    };

    logger.info('Complete weather data retrieved:', {
      city,
      current: `${current.temperature}°, ${current.description}`,
      forecastDays: forecast.dailyForecasts.length
    });

    return completeData;

  } catch (error) {
    logger.error('OpenWeather complete data error:', {
      city,
      error: error.message
    });
    throw new Error('Failed to get complete weather data from OpenWeather');
  }
};

/**
 * Get weather data optimized for travel planning
 * Returns a simplified, user-friendly weather summary
 * @param {string} city - City name
 * @param {string} units - Temperature units
 * @returns {Promise<Object>} Travel-optimized weather data
 */
const getWeatherForTravel = async (city, units = 'metric') => {
  try {
    const completeData = await getCompleteWeatherData(city, units);

    // Calculate average conditions for the trip
    const avgTemp = Math.round(
      completeData.forecast.reduce((sum, day) => sum + day.avgTemperature, 0) /
      completeData.forecast.length
    );

    const maxPrecipitation = Math.max(
      ...completeData.forecast.map(day => day.precipitationProbability)
    );

    // Determine best days for outdoor activities
    const bestDays = completeData.forecast
      .filter(day => day.precipitationProbability < 30 && day.avgTemperature > 15)
      .slice(0, 3);

    const travelWeather = {
      destination: city,
      currentWeather: {
        temperature: completeData.current.temperature,
        description: completeData.current.description,
        icon: completeData.current.iconUrl
      },
      weekAhead: {
        avgTemperature: avgTemp,
        highestTemp: Math.max(...completeData.forecast.map(d => d.maxTemperature)),
        lowestTemp: Math.min(...completeData.forecast.map(d => d.minTemperature)),
        rainChance: maxPrecipitation,
        conditions: completeData.forecast.map(d => d.description)
      },
      bestDaysForActivities: bestDays,
      recommendations: generateWeatherRecommendations(completeData),
      lastUpdated: completeData.timestamp,
      units: units === 'metric' ? 'Celsius' : 'Fahrenheit'
    };

    return travelWeather;

  } catch (error) {
    logger.error('Weather for travel error:', {
      city,
      error: error.message
    });
    throw error;
  }
};

/**
 * Generate weather-based travel recommendations
 * @param {Object} weatherData - Complete weather data
 * @returns {Array} Array of recommendation strings
 */
const generateWeatherRecommendations = (weatherData) => {
  const recommendations = [];
  const forecast = weatherData.forecast;

  if (!forecast || forecast.length === 0) {
    return recommendations;
  }

  // Check for rain
  const rainyDays = forecast.filter(day => day.precipitationProbability > 50).length;
  if (rainyDays > 2) {
    recommendations.push('Pack an umbrella and rain jacket - rain expected on multiple days');
  } else if (rainyDays > 0) {
    recommendations.push('Light rain possible - bring an umbrella just in case');
  }

  // Check temperature
  const avgTemp = forecast.reduce((sum, day) => sum + day.avgTemperature, 0) / forecast.length;
  if (avgTemp < 10) {
    recommendations.push('Pack warm clothes - temperatures will be cool');
  } else if (avgTemp > 30) {
    recommendations.push('Stay hydrated - hot weather expected');
    recommendations.push('Pack sunscreen and light clothing');
  } else if (avgTemp >= 20 && avgTemp <= 30) {
    recommendations.push('Perfect weather for outdoor activities!');
  }

  // Check temperature variation
  const tempRange = Math.max(...forecast.map(d => d.maxTemperature)) -
                    Math.min(...forecast.map(d => d.minTemperature));
  if (tempRange > 15) {
    recommendations.push('Large temperature variation - pack layers');
  }

  return recommendations;
};

module.exports = {
  isOpenWeatherAvailable,
  getCurrentWeather,
  getCurrentWeatherByCoords,
  getForecast,
  getForecastByCoords,
  getCompleteWeatherData,
  getWeatherForTravel
};
