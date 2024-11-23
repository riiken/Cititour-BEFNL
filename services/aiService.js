const axios = require('axios');
const { default: OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI.OpenAI({ apiKey: `sk-proj-tFo2LIEagl11O30s4eCqT3BlbkFJP4Big2vadHE5hD4mfbrh` });

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

const callAiApi = async (prompt) => {
  const structuredPrompt = `
    Please provide a response for the following query with the following format:
    - budget: A string that indicates the budget or "Not available" if the information is not available.
    - travelGuide: An array of objects with travel-related advice. Each object should represent a piece of travel advice or tip.
    - stayGuide: An array of objects with accommodation-related advice from cheapest to luxurious. Each object should represent a recommendation for stay options.
    - foodGuide: An array of objects with food-related advice. Each object should represent a recommended restaurant, dish, or local food experience.
    
    The response should strictly follow the format below especially link (ex- https://www.tamilnadutourism.tn.gov.in/destinations/kodaikanal) to that place as well as location url and all the links should be working, even if the information is not available. If the information is not available for any of the categories, use "Not available" or an empty array as appropriate.
    
    Query: ${prompt}

    Response Format:
    {
      "budget": "Not available",
      "travelGuide": [{placeName:'',imageURlFromGoogle:'',websitelink:'',explanation:'',location:''....}, {}, {}],
      "stayGuide": [{placeName:'',imageURlFromGoogle:'',websitelink:'',explanation:'',cost:'',location:'',....}, {}, {}],
      "foodGuide": [{placeName:'',imageURlFromGoogle:'',websitelink:'',explanation:'',cost:'',location:'',....}, {}, {}]
    }
  `;

  const completion = await openai.chat.completions.create({
    messages: [{ role: 'system', content: structuredPrompt }],
    model: 'gpt-4-turbo',
  });

  // Extract the message content from the AI response
  const responseContent = completion.choices[0].message.content;

  // Assuming the response is valid JSON, parse it
  try {
    const parsedResponse = JSON.parse(responseContent);
    return parsedResponse;
  } catch (error) {
    // If parsing fails, return a default structured response
    console.error('Error parsing AI response:', error.message);
    return {
      budget: 'Not available',
      travelGuide: [],
      stayGuide: [],
      foodGuide: [],
    };
  }
};


module.exports = { callAiApi };
