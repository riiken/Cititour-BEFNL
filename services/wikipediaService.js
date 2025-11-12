const axios = require('axios');
const logger = require('../config/logger');

/**
 * Wikipedia API Service - FREE Destination Information
 * No API key required!
 * Documentation: https://www.mediawiki.org/wiki/API:Main_page
 */

const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// Wikipedia requires a User-Agent header to identify the application
const USER_AGENT = 'CitiTour/1.0 (Travel Planning App; https://github.com/yourrepo)';

// Axios instance with default headers
const wikipediaAxios = axios.create({
  headers: {
    'User-Agent': USER_AGENT
  }
});

/**
 * Search Wikipedia for destinations
 * @param {string} query - Search query (e.g., "Tokyo")
 * @param {number} limit - Number of results (default: 5)
 * @returns {Promise<Array>} Search results
 */
const searchDestination = async (query, limit = 5) => {
  try {
    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'opensearch',
        search: query,
        limit: limit,
        namespace: 0,
        format: 'json'
      },
      timeout: 5000
    });

    // Parse OpenSearch response format: [query, [titles], [descriptions], [urls]]
    const [searchTerm, titles, descriptions, urls] = response.data;

    const results = titles.map((title, index) => ({
      title: title,
      description: descriptions[index] || '',
      url: urls[index] || '',
      source: 'Wikipedia'
    }));

    logger.info('Wikipedia search successful:', {
      query,
      resultsCount: results.length
    });

    return results;

  } catch (error) {
    logger.error('Wikipedia search error:', {
      query,
      error: error.message
    });
    throw new Error('Failed to search Wikipedia');
  }
};

/**
 * Get destination summary (extract)
 * @param {string} title - Wikipedia page title
 * @returns {Promise<Object>} Destination summary
 */
const getDestinationSummary = async (title) => {
  try {
    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        prop: 'extracts|pageimages|info',
        exintro: true,
        explaintext: true,
        exsentences: 5,
        piprop: 'original',
        inprop: 'url',
        titles: title,
        format: 'json'
      },
      timeout: 5000
    });

    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (pageId === '-1') {
      throw new Error('Page not found');
    }

    const summary = {
      title: page.title,
      extract: page.extract || 'No description available',
      image: page.original ? page.original.source : null,
      url: page.fullurl,
      source: 'Wikipedia'
    };

    logger.info('Wikipedia summary retrieved:', { title });

    return summary;

  } catch (error) {
    logger.error('Wikipedia summary error:', {
      title,
      error: error.message
    });
    throw new Error('Failed to get destination summary from Wikipedia');
  }
};

/**
 * Get detailed destination information
 * @param {string} title - Wikipedia page title
 * @returns {Promise<Object>} Detailed destination info
 */
const getDestinationDetails = async (title) => {
  try {
    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        prop: 'extracts|pageimages|categories|coordinates',
        exintro: false,
        explaintext: true,
        piprop: 'original',
        cllimit: 10,
        titles: title,
        format: 'json'
      },
      timeout: 10000
    });

    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (pageId === '-1') {
      throw new Error('Page not found');
    }

    // Extract coordinates if available
    let coordinates = null;
    if (page.coordinates && page.coordinates.length > 0) {
      coordinates = {
        lat: page.coordinates[0].lat,
        lon: page.coordinates[0].lon
      };
    }

    // Extract categories
    const categories = page.categories
      ? page.categories.map(cat => cat.title.replace('Category:', ''))
      : [];

    const details = {
      title: page.title,
      content: page.extract || 'No detailed information available',
      image: page.original ? page.original.source : null,
      coordinates: coordinates,
      categories: categories,
      source: 'Wikipedia'
    };

    logger.info('Wikipedia details retrieved:', { title });

    return details;

  } catch (error) {
    logger.error('Wikipedia details error:', {
      title,
      error: error.message
    });
    throw new Error('Failed to get destination details from Wikipedia');
  }
};

/**
 * Get multiple images for a destination
 * @param {string} title - Wikipedia page title
 * @param {number} limit - Number of images (default: 5)
 * @returns {Promise<Array>} Array of image URLs
 */
const getDestinationImages = async (title, limit = 5) => {
  try {
    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        prop: 'images',
        imlimit: limit * 2, // Get more to filter out icons/logos
        titles: title,
        format: 'json'
      },
      timeout: 5000
    });

    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (pageId === '-1' || !page.images) {
      return [];
    }

    // Get image URLs
    const imagePromises = page.images
      .filter(img => {
        // Filter out common icons and logos
        const filename = img.title.toLowerCase();
        return !filename.includes('icon') &&
               !filename.includes('logo') &&
               !filename.includes('.svg') &&
               (filename.includes('.jpg') || filename.includes('.jpeg') || filename.includes('.png'));
      })
      .slice(0, limit)
      .map(img => getImageUrl(img.title));

    const imageUrls = await Promise.all(imagePromises);
    const filteredUrls = imageUrls.filter(url => url !== null);

    logger.info('Wikipedia images retrieved:', {
      title,
      count: filteredUrls.length
    });

    return filteredUrls;

  } catch (error) {
    logger.error('Wikipedia images error:', {
      title,
      error: error.message
    });
    return [];
  }
};

/**
 * Get image URL from image title
 * @param {string} imageTitle - Image title (e.g., "File:Image.jpg")
 * @returns {Promise<string|null>} Image URL
 */
const getImageUrl = async (imageTitle) => {
  try {
    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        prop: 'imageinfo',
        iiprop: 'url',
        titles: imageTitle,
        format: 'json'
      },
      timeout: 3000
    });

    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (page.imageinfo && page.imageinfo.length > 0) {
      return page.imageinfo[0].url;
    }

    return null;

  } catch (error) {
    return null;
  }
};

/**
 * Get related destinations based on categories
 * @param {string} title - Wikipedia page title
 * @param {number} limit - Number of related destinations (default: 5)
 * @returns {Promise<Array>} Related destinations
 */
const getRelatedDestinations = async (title, limit = 5) => {
  try {
    // First, get the categories of the destination
    const details = await getDestinationDetails(title);

    if (!details.categories || details.categories.length === 0) {
      return [];
    }

    // Use the first relevant category to find related pages
    const category = details.categories.find(cat =>
      cat.includes('Cities') ||
      cat.includes('Tourist') ||
      cat.includes('Destinations') ||
      cat.includes('Geography')
    ) || details.categories[0];

    const response = await wikipediaAxios.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${category}`,
        cmlimit: limit + 5,
        cmtype: 'page',
        format: 'json'
      },
      timeout: 5000
    });

    const members = response.data.query.categorymembers
      .filter(member => member.title !== title) // Exclude current destination
      .slice(0, limit);

    const relatedPromises = members.map(member =>
      getDestinationSummary(member.title).catch(() => null)
    );

    const related = await Promise.all(relatedPromises);
    const filteredRelated = related.filter(item => item !== null);

    logger.info('Related destinations retrieved:', {
      title,
      count: filteredRelated.length
    });

    return filteredRelated;

  } catch (error) {
    logger.error('Related destinations error:', {
      title,
      error: error.message
    });
    return [];
  }
};

module.exports = {
  searchDestination,
  getDestinationSummary,
  getDestinationDetails,
  getDestinationImages,
  getRelatedDestinations
};
