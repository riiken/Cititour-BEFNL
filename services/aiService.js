const axios = require('axios');
const { generateTravelRecommendation, generateQuickSuggestion } = require('../config/gemini');
require('dotenv').config();

// ============================================
// MIGRATED FROM OPENAI TO GOOGLE GEMINI (FREE!)
// Saving $250-2500/month in API costs
// ============================================

// const callAiApi = async (prompt) => {
//   const completion = await openai.chat.completions.create({
//     messages: [{ role: 'system', content: prompt }],
//     model: 'gpt-4-turbo',
//   });

//   // Extract the message content from the AI response
//   const responseContent = completion.choices[0].message.content;

//   // Check if the response is valid JSON or plain text
//   let parsedResponse;
//   try {
//     // Try to parse the content as JSON
//     parsedResponse = JSON.parse(responseContent);
//   } catch (error) {
//     // If it's not valid JSON, treat it as plain text and structure it
//     parsedResponse = {
//       guides: responseContent,
//       budget: 'Not available',
//       travelGuide: 'Not available',
//       stayGuide: 'Not available',
//     };
//   }

//   return parsedResponse;
// };

/**
 * Generate structured travel guide using Google Gemini (FREE!)
 * Replaces expensive OpenAI API
 */
const callAiApi = async (prompt) => {
  const structuredPrompt = `
    You are an expert travel advisor. Please provide a comprehensive response for the following travel query.

    Query: ${prompt}

    Return your response in the following JSON format (IMPORTANT: Return only valid JSON, no markdown):
    {
      "budget": "Estimated budget or 'Not available'",
      "travelGuide": [
        {
          "placeName": "Attraction name",
          "imageURLFromGoogle": "Direct image URL",
          "websitelink": "Official website URL",
          "explanation": "Why visit this place (2-3 sentences)",
          "location": "Specific location/address"
        }
      ],
      "stayGuide": [
        {
          "placeName": "Hotel name",
          "imageURLFromGoogle": "Direct image URL",
          "websitelink": "Booking URL",
          "explanation": "Hotel description and amenities",
          "cost": "Price per night",
          "location": "Hotel address"
        }
      ],
      "foodGuide": [
        {
          "placeName": "Restaurant name",
          "imageURLFromGoogle": "Direct image URL",
          "websitelink": "Restaurant website",
          "explanation": "What to try and why",
          "cost": "Price range ($/$$/$$$)",
          "location": "Restaurant address"
        }
      ]
    }

    IMPORTANT:
    - Provide 5-7 items for each category
    - All links must be real and working
    - Images should be direct URLs, not search queries
    - Return ONLY the JSON, no additional text
  `;

  try {
    // Use Gemini API (FREE!)
    const responseContent = await generateTravelRecommendation(structuredPrompt);

    // Clean up response - remove markdown code blocks if present
    let cleanedResponse = responseContent.trim();
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse JSON
    const parsedResponse = JSON.parse(cleanedResponse);
    console.log('✅ Travel guide generated successfully with Gemini (FREE!)');
    return parsedResponse;

  } catch (error) {
    console.error('❌ Error generating travel guide with Gemini:', error.message);

    // Return fallback structure
    return {
      budget: 'Not available',
      travelGuide: [],
      stayGuide: [],
      foodGuide: [],
      error: 'Failed to generate travel guide. Please try again.'
    };
  }
};


/**
 * Generate quick suggestions using Google Gemini (FREE!)
 * For simpler queries like destinations, tips, etc.
 */
const callOpenAIPrompt = async (prompt) => {
  try {
    // Use Gemini API for quick suggestions
    const responseContent = await generateQuickSuggestion(prompt);

    // Try to parse as JSON first
    try {
      let cleanedResponse = responseContent.trim();
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsedResponse = JSON.parse(cleanedResponse);
      console.log('✅ Quick suggestion generated with Gemini (FREE!)');
      return parsedResponse;
    } catch (parseError) {
      // If not JSON, return as text wrapped in object
      console.log('✅ Text response generated with Gemini (FREE!)');
      return {
        name: 'Destination Suggestion',
        description: responseContent,
        image: '',
        discount: ''
      };
    }

  } catch (error) {
    console.error('❌ Error generating suggestion with Gemini:', error.message);
    return {
      name: 'Not available',
      image: '',
      description: 'Failed to generate suggestion. Please try again.',
      discount: '',
    };
  }
};

module.exports = { callAiApi , callOpenAIPrompt };
