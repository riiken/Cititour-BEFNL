const AiResponse = require('../model/aiResponse');
const { callAiApi } = require('../services/aiService');

const handleQuery = async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Check for existing response in the database
    let aiResponse = await AiResponse.findOne({ query });

    if (!aiResponse) {
      // If no response found, call the AI API and format the response
      const guides = await callAiApi(query);
      
      // Format the response as needed (e.g., separate fields for budget, travel guide, etc.)
      const formattedResponse = {
        budget: guides.budget || 'Not available', // Make sure budget is a string
        travelGuide: guides.travelGuide || [],    // Ensure it's an array, not a string
        stayGuide: guides.stayGuide || [],        // Ensure it's an array, not a string
        foodGuide: guides.foodGuide || [],        // Ensure it's an array, not a string
      };
    
      // Save the formatted response to the database
      aiResponse = new AiResponse({
        query,
        budget: formattedResponse.budget,
        travelGuide: formattedResponse.travelGuide,
        stayGuide: formattedResponse.stayGuide,
        foodGuide: formattedResponse.foodGuide,
      });
      
      await aiResponse.save();
    }
    
    // Return the response
    return res.json({ query, guides: aiResponse });
  } catch (error) {
    console.error('Error handling query:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { handleQuery };
