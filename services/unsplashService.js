const axios = require('axios');
const logger = require('../config/logger');

/**
 * Unsplash API Service - FREE High-Quality Images
 * Free Tier: 50 requests/hour
 * No credit card required!
 * Get your FREE API key: https://unsplash.com/developers
 *
 * Unsplash provides beautiful, high-resolution photos perfect for travel destinations.
 * API Documentation: https://unsplash.com/documentation
 */

const UNSPLASH_API_URL = 'https://api.unsplash.com';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_API_KEY;

/**
 * Check if Unsplash API is configured
 * @returns {boolean}
 */
const isUnsplashAvailable = () => {
  return !!(UNSPLASH_ACCESS_KEY && UNSPLASH_ACCESS_KEY !== 'your_unsplash_api_key_here');
};

/**
 * Search photos by query
 * @param {string} query - Search query (e.g., "Tokyo", "Paris landmarks")
 * @param {number} page - Page number (default: 1)
 * @param {number} perPage - Results per page (default: 10, max: 30)
 * @param {string} orientation - Photo orientation: 'landscape', 'portrait', 'squarish'
 * @returns {Promise<Object>} Search results with photos
 */
const searchPhotos = async (query, page = 1, perPage = 10, orientation = null) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    const params = {
      query: query,
      page: page,
      per_page: Math.min(perPage, 30), // Unsplash max is 30
      client_id: UNSPLASH_ACCESS_KEY
    };

    if (orientation) {
      params.orientation = orientation;
    }

    const response = await axios.get(`${UNSPLASH_API_URL}/search/photos`, {
      params: params,
      timeout: 5000
    });

    const data = response.data;

    const photos = data.results.map(photo => ({
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      altDescription: photo.alt_description || '',
      urls: {
        raw: photo.urls.raw,
        full: photo.urls.full,
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb
      },
      width: photo.width,
      height: photo.height,
      color: photo.color,
      likes: photo.likes,
      photographer: {
        name: photo.user.name,
        username: photo.user.username,
        profileUrl: photo.user.links.html,
        portfolioUrl: photo.user.portfolio_url
      },
      unsplashUrl: photo.links.html,
      downloadUrl: photo.links.download,
      createdAt: photo.created_at,
      source: 'Unsplash'
    }));

    const result = {
      total: data.total,
      totalPages: data.total_pages,
      page: page,
      perPage: perPage,
      photos: photos,
      query: query,
      source: 'Unsplash',
      timestamp: new Date().toISOString()
    };

    logger.info('Unsplash search successful:', {
      query,
      resultsCount: photos.length,
      total: data.total
    });

    return result;

  } catch (error) {
    logger.error('Unsplash search error:', {
      query,
      error: error.message
    });

    if (error.response && error.response.status === 403) {
      throw new Error('Unsplash API rate limit exceeded (50/hour)');
    }

    throw new Error('Failed to search photos on Unsplash');
  }
};

/**
 * Get random photos by topic
 * @param {string} query - Topic query (optional)
 * @param {number} count - Number of photos (default: 1, max: 30)
 * @param {string} orientation - Photo orientation
 * @returns {Promise<Array>} Array of random photos
 */
const getRandomPhotos = async (query = null, count = 1, orientation = null) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    const params = {
      count: Math.min(count, 30),
      client_id: UNSPLASH_ACCESS_KEY
    };

    if (query) {
      params.query = query;
    }

    if (orientation) {
      params.orientation = orientation;
    }

    const response = await axios.get(`${UNSPLASH_API_URL}/photos/random`, {
      params: params,
      timeout: 5000
    });

    // Response is an array if count > 1, single object if count = 1
    const rawPhotos = Array.isArray(response.data) ? response.data : [response.data];

    const photos = rawPhotos.map(photo => ({
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      altDescription: photo.alt_description || '',
      urls: {
        raw: photo.urls.raw,
        full: photo.urls.full,
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb
      },
      width: photo.width,
      height: photo.height,
      color: photo.color,
      likes: photo.likes,
      photographer: {
        name: photo.user.name,
        username: photo.user.username,
        profileUrl: photo.user.links.html,
        portfolioUrl: photo.user.portfolio_url
      },
      unsplashUrl: photo.links.html,
      downloadUrl: photo.links.download,
      createdAt: photo.created_at,
      location: photo.location ? {
        title: photo.location.title,
        name: photo.location.name,
        city: photo.location.city,
        country: photo.location.country,
        position: photo.location.position
      } : null,
      source: 'Unsplash'
    }));

    logger.info('Unsplash random photos retrieved:', {
      query: query || 'random',
      count: photos.length
    });

    return photos;

  } catch (error) {
    logger.error('Unsplash random photos error:', {
      query,
      error: error.message
    });

    if (error.response && error.response.status === 403) {
      throw new Error('Unsplash API rate limit exceeded (50/hour)');
    }

    throw new Error('Failed to get random photos from Unsplash');
  }
};

/**
 * Get a single photo by ID
 * @param {string} photoId - Unsplash photo ID
 * @returns {Promise<Object>} Photo details
 */
const getPhotoById = async (photoId) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    const response = await axios.get(`${UNSPLASH_API_URL}/photos/${photoId}`, {
      params: {
        client_id: UNSPLASH_ACCESS_KEY
      },
      timeout: 5000
    });

    const photo = response.data;

    const photoDetails = {
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      altDescription: photo.alt_description || '',
      urls: {
        raw: photo.urls.raw,
        full: photo.urls.full,
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb
      },
      width: photo.width,
      height: photo.height,
      color: photo.color,
      likes: photo.likes,
      downloads: photo.downloads,
      views: photo.views,
      photographer: {
        name: photo.user.name,
        username: photo.user.username,
        profileUrl: photo.user.links.html,
        portfolioUrl: photo.user.portfolio_url,
        bio: photo.user.bio
      },
      unsplashUrl: photo.links.html,
      downloadUrl: photo.links.download,
      location: photo.location ? {
        title: photo.location.title,
        name: photo.location.name,
        city: photo.location.city,
        country: photo.location.country,
        position: photo.location.position
      } : null,
      exif: photo.exif ? {
        make: photo.exif.make,
        model: photo.exif.model,
        exposureTime: photo.exif.exposure_time,
        aperture: photo.exif.aperture,
        focalLength: photo.exif.focal_length,
        iso: photo.exif.iso
      } : null,
      tags: photo.tags ? photo.tags.map(tag => tag.title) : [],
      createdAt: photo.created_at,
      updatedAt: photo.updated_at,
      source: 'Unsplash'
    };

    logger.info('Unsplash photo retrieved:', { photoId });

    return photoDetails;

  } catch (error) {
    logger.error('Unsplash get photo error:', {
      photoId,
      error: error.message
    });

    if (error.response && error.response.status === 404) {
      throw new Error('Photo not found');
    }

    throw new Error('Failed to get photo from Unsplash');
  }
};

/**
 * Get photos for a destination with smart querying
 * Optimized for travel destinations
 * @param {string} destination - Destination name (e.g., "Tokyo", "Eiffel Tower")
 * @param {number} count - Number of photos (default: 5)
 * @param {string} type - Type of photos: 'landmarks', 'cityscape', 'culture', 'nature', 'food'
 * @returns {Promise<Array>} Array of destination photos
 */
const getDestinationPhotos = async (destination, count = 5, type = null) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    // Build smart query based on destination and type
    let query = destination;

    if (type) {
      switch (type) {
        case 'landmarks':
          query = `${destination} landmarks attractions`;
          break;
        case 'cityscape':
          query = `${destination} city skyline aerial`;
          break;
        case 'culture':
          query = `${destination} culture people traditional`;
          break;
        case 'nature':
          query = `${destination} nature landscape scenic`;
          break;
        case 'food':
          query = `${destination} food cuisine restaurant`;
          break;
        default:
          query = `${destination} travel`;
      }
    } else {
      query = `${destination} travel destination`;
    }

    const result = await searchPhotos(query, 1, count, 'landscape');

    logger.info('Destination photos retrieved:', {
      destination,
      type: type || 'general',
      count: result.photos.length
    });

    return result.photos;

  } catch (error) {
    logger.error('Destination photos error:', {
      destination,
      type,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get a curated collection for travel inspiration
 * @param {string} collectionId - Unsplash collection ID (optional)
 * @param {number} page - Page number
 * @param {number} perPage - Results per page
 * @returns {Promise<Object>} Collection photos
 */
const getCollectionPhotos = async (collectionId = '3330445', page = 1, perPage = 10) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    // Default collection ID is "Travel & Adventure" curated collection
    const response = await axios.get(
      `${UNSPLASH_API_URL}/collections/${collectionId}/photos`,
      {
        params: {
          page: page,
          per_page: Math.min(perPage, 30),
          client_id: UNSPLASH_ACCESS_KEY
        },
        timeout: 5000
      }
    );

    const photos = response.data.map(photo => ({
      id: photo.id,
      description: photo.description || photo.alt_description || '',
      altDescription: photo.alt_description || '',
      urls: {
        raw: photo.urls.raw,
        full: photo.urls.full,
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb
      },
      width: photo.width,
      height: photo.height,
      color: photo.color,
      likes: photo.likes,
      photographer: {
        name: photo.user.name,
        username: photo.user.username,
        profileUrl: photo.user.links.html
      },
      unsplashUrl: photo.links.html,
      source: 'Unsplash'
    }));

    logger.info('Collection photos retrieved:', {
      collectionId,
      count: photos.length
    });

    return {
      collectionId,
      page,
      perPage,
      photos,
      source: 'Unsplash',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Collection photos error:', {
      collectionId,
      error: error.message
    });
    throw new Error('Failed to get collection photos from Unsplash');
  }
};

/**
 * Track photo download (required by Unsplash API guidelines)
 * Must be called when user downloads or uses a photo
 * @param {string} downloadUrl - Download URL from photo object
 * @returns {Promise<void>}
 */
const trackDownload = async (downloadUrl) => {
  try {
    if (!isUnsplashAvailable()) {
      return; // Silently skip if not configured
    }

    // Extract download endpoint from full URL if needed
    const downloadEndpoint = downloadUrl.includes('unsplash.com')
      ? downloadUrl
      : `${UNSPLASH_API_URL}${downloadUrl}`;

    await axios.get(downloadEndpoint, {
      params: {
        client_id: UNSPLASH_ACCESS_KEY
      },
      timeout: 3000
    });

    logger.info('Unsplash download tracked');

  } catch (error) {
    logger.warn('Failed to track Unsplash download:', error.message);
    // Don't throw error - download tracking is best-effort
  }
};

/**
 * Get comprehensive image data for a destination
 * Combines multiple types of photos for rich travel content
 * @param {string} destination - Destination name
 * @returns {Promise<Object>} Complete image collection
 */
const getDestinationImageCollection = async (destination) => {
  try {
    if (!isUnsplashAvailable()) {
      throw new Error('Unsplash API key not configured');
    }

    // Fetch different types of photos in parallel
    const [landmarks, cityscapes, culture, nature] = await Promise.allSettled([
      getDestinationPhotos(destination, 3, 'landmarks'),
      getDestinationPhotos(destination, 2, 'cityscape'),
      getDestinationPhotos(destination, 2, 'culture'),
      getDestinationPhotos(destination, 2, 'nature')
    ]);

    const collection = {
      destination,
      hero: landmarks.status === 'fulfilled' && landmarks.value.length > 0
        ? landmarks.value[0]
        : null,
      landmarks: landmarks.status === 'fulfilled' ? landmarks.value : [],
      cityscapes: cityscapes.status === 'fulfilled' ? cityscapes.value : [],
      culture: culture.status === 'fulfilled' ? culture.value : [],
      nature: nature.status === 'fulfilled' ? nature.value : [],
      totalImages: 0,
      source: 'Unsplash',
      timestamp: new Date().toISOString()
    };

    // Calculate total images
    collection.totalImages =
      collection.landmarks.length +
      collection.cityscapes.length +
      collection.culture.length +
      collection.nature.length;

    logger.info('Destination image collection retrieved:', {
      destination,
      totalImages: collection.totalImages
    });

    return collection;

  } catch (error) {
    logger.error('Destination image collection error:', {
      destination,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get photo attribution text (required by Unsplash API guidelines)
 * @param {Object} photo - Photo object from Unsplash
 * @returns {string} Attribution text
 */
const getPhotoAttribution = (photo) => {
  if (!photo || !photo.photographer) {
    return 'Photo from Unsplash';
  }

  return `Photo by ${photo.photographer.name} on Unsplash`;
};

/**
 * Get photo attribution HTML (for web display)
 * @param {Object} photo - Photo object from Unsplash
 * @returns {string} Attribution HTML
 */
const getPhotoAttributionHTML = (photo) => {
  if (!photo || !photo.photographer) {
    return '<a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Unsplash</a>';
  }

  return `Photo by <a href="${photo.photographer.profileUrl}?utm_source=cititour&utm_medium=referral" target="_blank" rel="noopener noreferrer">${photo.photographer.name}</a> on <a href="https://unsplash.com?utm_source=cititour&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>`;
};

module.exports = {
  isUnsplashAvailable,
  searchPhotos,
  getRandomPhotos,
  getPhotoById,
  getDestinationPhotos,
  getCollectionPhotos,
  trackDownload,
  getDestinationImageCollection,
  getPhotoAttribution,
  getPhotoAttributionHTML
};
