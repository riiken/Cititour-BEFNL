const AiResponse = require('../model/aiResponse');
const {
  callAiApi,
  attachLinks,
  AiUnavailableError,
  TRAVEL_GUIDE_PROMPT_VERSION
} = require('../services/aiService');
const { reserveAiGeneration } = require('../services/aiBudget');
const logger = require('../config/logger');

// Cached guides are regenerated after this many days (they are not deleted).
const GUIDE_MAX_AGE_MS = Number(process.env.AI_GUIDE_CACHE_DAYS || 30) * 24 * 60 * 60 * 1000;

const normalise = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Optional structured trip details sent by newer clients. All fields are
 * validated in middleware/validation.js#validateAIQuery.
 */
const readContext = (body) => ({
  destination: body.destination,
  checkIn: body.checkIn,
  checkOut: body.checkOut,
  travellers: body.travellers,
  budget: body.budget,
  interests: Array.isArray(body.interests) ? body.interests : undefined
});

const buildCacheKey = (query, context) => {
  const parts = [
    TRAVEL_GUIDE_PROMPT_VERSION,
    normalise(query),
    normalise(context.destination),
    context.checkIn || '',
    context.checkOut || '',
    context.travellers || '',
    normalise(context.budget),
    (context.interests || []).map(normalise).sort().join(',')
  ];
  return parts.join('|');
};

const handleQuery = async (req, res, next) => {
  const { query } = req.body;
  const context = readContext(req.body);
  const cacheKey = buildCacheKey(query, context);

  try {
    let aiResponse = await AiResponse.findOne({ query: cacheKey });
    const isFresh = aiResponse && Date.now() - new Date(aiResponse.updatedAt).getTime() < GUIDE_MAX_AGE_MS;

    if (!isFresh) {
      const allowed = await reserveAiGeneration();
      if (!allowed) {
        if (aiResponse) {
          // Over budget: serve the stale guide rather than nothing.
          return res.json({ query, guides: attachLinks(aiResponse.toJSON(), context), stale: true });
        }
        throw new AiUnavailableError('Trip planning is busy right now. Please try again in a little while.');
      }

      // Failures throw and are never cached.
      const guide = await callAiApi(query, context);

      aiResponse = await AiResponse.findOneAndUpdate(
        { query: cacheKey },
        {
          $set: {
            originalQuery: query,
            promptVersion: TRAVEL_GUIDE_PROMPT_VERSION,
            destination: guide.destination,
            budget: guide.budget,
            travelGuide: guide.travelGuide,
            stayGuide: guide.stayGuide,
            foodGuide: guide.foodGuide
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({ query, guides: attachLinks(aiResponse.toJSON(), context) });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return res.status(503).json({
        success: false,
        message: error.message,
        retryAfterSeconds: 60
      });
    }
    logger.error('Error handling AI query', { error: error.message });
    return next(error);
  }
};

module.exports = { handleQuery, buildCacheKey };
