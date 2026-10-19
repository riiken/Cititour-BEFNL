const { GoogleGenerativeAI } = require("@google/generative-ai");

// Model IDs are configuration: Google retires model versions regularly.
const DEFAULT_MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

// Created lazily so the client always sees the key loaded by dotenv.
let genAI = null;
const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
};

/**
 * Get Gemini model instance
 * @param {string} modelName - Model to use (default: GEMINI_MODEL env)
 * @param {Object} generationConfig - Optional generation config (e.g. JSON mode)
 * @returns {Object} Gemini model instance
 */
const getGeminiModel = (modelName = DEFAULT_MODEL(), generationConfig = undefined) => {
  return getClient().getGenerativeModel({ model: modelName, generationConfig });
};

/**
 * Generate travel recommendation using Gemini
 * @param {string} prompt - Travel query prompt
 * @returns {Promise<string>} AI-generated response
 */
const generateTravelRecommendation = async (prompt, { json = false } = {}) => {
  try {
    const model = getGeminiModel(
      DEFAULT_MODEL(),
      json ? { responseMimeType: 'application/json', temperature: 0.6 } : undefined
    );

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('✅ Gemini API call successful (FREE!)');
    return text;
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    throw error;
  }
};

/**
 * Generate structured travel plan with JSON response
 * @param {string} destination - Destination name
 * @param {Object} preferences - User preferences (budget, days, interests, style)
 * @returns {Promise<Object>} Structured travel plan JSON
 */
const generateStructuredTravelPlan = async (destination, preferences = {}) => {
  const {
    budget = 'moderate',
    days = 7,
    interests = 'sightseeing, food, culture',
    style = 'balanced'
  } = preferences;

  const prompt = `You are an expert travel planning assistant. Create a comprehensive ${days}-day travel plan for ${destination}.

User Preferences:
- Budget: ${budget}
- Duration: ${days} days
- Interests: ${interests}
- Travel Style: ${style}

Please provide a detailed, structured response in JSON format with these sections:

{
  "destination": "${destination}",
  "overview": "Brief overview of the destination (2-3 sentences)",
  "bestTimeToVisit": "Best months to visit and why",
  "budget": {
    "total": "Estimated total budget",
    "perDay": "Average cost per day",
    "breakdown": {
      "accommodation": "Estimated cost",
      "food": "Estimated cost",
      "activities": "Estimated cost",
      "transportation": "Estimated cost"
    }
  },
  "itinerary": [
    {
      "day": 1,
      "title": "Day title",
      "activities": [
        {
          "time": "Morning/Afternoon/Evening",
          "activity": "Activity name",
          "description": "Brief description",
          "estimatedCost": "Cost estimate",
          "duration": "Duration"
        }
      ]
    }
  ],
  "hotels": [
    {
      "name": "Hotel name",
      "category": "budget/mid-range/luxury",
      "priceRange": "Price per night",
      "location": "Neighborhood/area",
      "highlights": ["Feature 1", "Feature 2", "Feature 3"]
    }
  ],
  "restaurants": [
    {
      "name": "Restaurant name",
      "cuisine": "Cuisine type",
      "priceRange": "$/$$/$$$/$$$$",
      "mealType": "breakfast/lunch/dinner",
      "mustTry": ["Dish 1", "Dish 2"],
      "location": "Area"
    }
  ],
  "transportation": {
    "gettingThere": "How to reach the destination",
    "gettingAround": "Local transportation options",
    "tips": ["Transportation tip 1", "Transportation tip 2"]
  },
  "travelTips": [
    "Important tip 1",
    "Important tip 2",
    "Important tip 3"
  ],
  "packingList": ["Item 1", "Item 2", "Item 3"]
}

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no additional text.`;

  try {
    const model = getGeminiModel(DEFAULT_MODEL(), { responseMimeType: 'application/json' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean up response - remove markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse JSON
    const travelPlan = JSON.parse(text);

    console.log('✅ Structured travel plan generated for:', destination);
    return travelPlan;
  } catch (error) {
    console.error('❌ Gemini structured generation error:', error.message);

    // If JSON parsing fails, return a basic structure
    if (error instanceof SyntaxError) {
      console.warn('⚠️  JSON parsing failed, using fallback structure');
      return {
        destination,
        error: 'Failed to generate structured plan',
        message: 'Please try again with a different destination'
      };
    }

    throw error;
  }
};

/**
 * Generate quick travel suggestion (for chat/simple queries)
 * @param {string} userQuery - User's question
 * @returns {Promise<string>} AI response
 */
const generateQuickSuggestion = async (userQuery) => {
  const prompt = `You are a helpful travel assistant. Answer this travel question concisely:

${userQuery}

Provide a helpful, friendly response in 2-3 paragraphs.`;

  return await generateTravelRecommendation(prompt);
};

module.exports = {
  getGeminiModel,
  generateTravelRecommendation,
  generateStructuredTravelPlan,
  generateQuickSuggestion
};
