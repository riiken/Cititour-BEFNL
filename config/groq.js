const Groq = require("groq-sdk");

// Initialize Groq AI (FREE alternative, 6000 requests/day!)
// Only initialize if API key is provided
let groq = null;

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
    throw new Error('Groq API key not configured. Get your FREE key at: https://console.groq.com/');
  }

  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  return groq;
};

/**
 * Generate travel recommendation using Groq (LLaMA 3)
 * @param {string} prompt - Travel query prompt
 * @param {string} model - Model to use (default: llama-3.3-70b-versatile)
 * @returns {Promise<string>} AI-generated response
 */
const generateGroqRecommendation = async (prompt, model = process.env.GROQ_MODEL || "openai/gpt-oss-120b", { json = false } = {}) => {
  try {
    const groqClient = getGroqClient();
    const chatCompletion = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an expert travel planning assistant. Provide detailed, accurate, and helpful travel recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: model,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 1,
      stream: false,
      ...(json && { response_format: { type: "json_object" } })
    });

    const response = chatCompletion.choices[0]?.message?.content || "";
    console.log('✅ Groq AI call successful (FREE - LLaMA 3.3!)');
    return response;
  } catch (error) {
    console.error('❌ Groq AI error:', error.message);
    throw error;
  }
};

/**
 * Generate structured travel plan with Groq
 * @param {string} destination - Destination name
 * @param {Object} preferences - User preferences
 * @returns {Promise<Object>} Structured travel plan JSON
 */
const generateGroqStructuredPlan = async (destination, preferences = {}) => {
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
    const response = await generateGroqRecommendation(prompt, undefined, { json: true });

    // Clean up response - remove markdown code blocks if present
    let text = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse JSON
    const travelPlan = JSON.parse(text);

    console.log('✅ Structured travel plan generated with Groq for:', destination);
    return travelPlan;
  } catch (error) {
    console.error('❌ Groq structured generation error:', error.message);

    // If JSON parsing fails, return a basic structure
    if (error instanceof SyntaxError) {
      console.warn('⚠️  JSON parsing failed (Groq), using fallback structure');
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
 * Generate quick travel suggestion using Groq
 * @param {string} userQuery - User's question
 * @returns {Promise<string>} AI response
 */
const generateGroqQuickSuggestion = async (userQuery) => {
  const prompt = `You are a helpful travel assistant. Answer this travel question concisely:

${userQuery}

Provide a helpful, friendly response in 2-3 paragraphs.`;

  return await generateGroqRecommendation(prompt);
};

/**
 * Check if Groq API is configured and working
 * @returns {Promise<boolean>} True if Groq is available
 */
const isGroqAvailable = async () => {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
    return false;
  }

  try {
    // Quick test with a simple query
    await generateGroqRecommendation("Say 'OK' if you're working.");
    return true;
  } catch (error) {
    console.warn('⚠️  Groq API not available:', error.message);
    return false;
  }
};

module.exports = {
  generateGroqRecommendation,
  generateGroqStructuredPlan,
  generateGroqQuickSuggestion,
  isGroqAvailable
};
