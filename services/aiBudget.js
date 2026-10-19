const mongoose = require('mongoose');
const logger = require('../config/logger');

/**
 * Global daily cap on LLM generations, shared by all server instances.
 *
 * AI_DAILY_GENERATION_LIMIT (default 500): generations allowed per UTC day.
 * AI_ENABLED=false: kill-switch, disables new generations entirely.
 * Cached results are still served when the cap is reached.
 */
const aiUsageDaySchema = new mongoose.Schema({
  _id: { type: String }, // YYYY-MM-DD (UTC)
  count: { type: Number, default: 0 }
}, { versionKey: false });

const AiUsageDay = mongoose.models.AiUsageDay || mongoose.model('AiUsageDay', aiUsageDaySchema, 'ai_usage_days');

const dailyLimit = () => Number(process.env.AI_DAILY_GENERATION_LIMIT || 500);

const today = () => new Date().toISOString().slice(0, 10);

const reserveAiGeneration = async () => {
  if (process.env.AI_ENABLED === 'false') return false;

  const day = await AiUsageDay.findOneAndUpdate(
    { _id: today() },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  if (day.count > dailyLimit()) {
    if (day.count === dailyLimit() + 1) {
      logger.warn('AI daily generation limit reached', { limit: dailyLimit(), day: day._id });
    }
    return false;
  }
  return true;
};

const getAiUsageToday = async () => {
  const day = await AiUsageDay.findById(today()).lean();
  return { day: today(), count: day ? day.count : 0, limit: dailyLimit() };
};

module.exports = { reserveAiGeneration, getAiUsageToday };
