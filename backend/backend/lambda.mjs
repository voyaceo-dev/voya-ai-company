// Environment variables
const corsOrigin = process.env.CORS_ORIGIN || '*';
const ollamaApiKey = process.env.OLLAMA_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': corsOrigin,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

async function handleHealth() {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      status: 'ok',
      message: 'VOYA API running on AWS Lambda',
      aiProviders: {
        primary: 'Ollama Gemini 3 Flash',
        fallback: 'OpenRouter Mistral'
      }
    }),
  };
}

// Try Ollama Gemini first (primary)
async function callOllamaGemini(prompt) {
  if (!ollamaApiKey) {
    throw new Error('Ollama API key not configured');
  }

  const response = await fetch(
    'https://ollama.com/api/chat',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ollamaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-3-flash-preview:cloud',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful travel planner assistant. Create detailed, practical, and engaging travel itineraries.',
          },
          {
            role: 'user',
            content: prompt
          }
        ],
                options: { num_predict: 1200, temperature: 0.8 },
        stream: false
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

// Fallback to OpenRouter (secondary)
async function callOpenRouter(prompt) {
  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Key ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful travel planner assistant. Create detailed, practical, and engaging travel itineraries.',
          },
          { role: 'user', content: prompt },
        ],
        model: 'mistralai/devstral-2512:free',
        max_tokens: 2000,
        temperature: 0.7,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function generateItinerary({ destination, duration, preferences }) {
  const prompt =    const prompt = `${duration}-day ${destination} itinerary` + (preferences ? ` focusing on: ${preferences}` : '') + '. Brief format with times, places, costs, transport.';

  let itinerary = '';
  let aiProvider = 'unknown';

  try {
    // Try primary: Ollama Gemini
    console.log('Attempting to use primary AI: Ollama Gemini');
    itinerary = await callOllamaGemini(prompt);
    aiProvider = 'ollama-gemini';
    console.log('Successfully used Ollama Gemini');
  } catch (err) {
    console.error('Ollama Gemini failed:', err.message);
    
    try {
      // Fallback to secondary: OpenRouter
      console.log('Falling back to secondary AI: OpenRouter');
      itinerary = await callOpenRouter(prompt);
      aiProvider = 'openrouter-mistral';
      console.log('Successfully used OpenRouter fallback');
    } catch (fallbackErr) {
      console.error('OpenRouter fallback also failed:', fallbackErr.message);
      throw new Error('Both AI providers failed');
    }
  }

  // Store in Supabase (optional - currently disabled)
  /*
  const { error: dbError } = await supabase
    .from('itineraries')
    .insert([{ destination, duration, preferences, itinerary, ai_provider: aiProvider, created_at: new Date().toISOString() }]);

  if (dbError) {
    console.error('Supabase error:', dbError);
  }
  */

  return { itinerary, aiProvider };
}

async function handleGenerate(event) {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { destination, duration, preferences } = body;

  if (!destination || !duration) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'destination and duration are required' }),
    };
  }

  try {
    const result = await 104
      ({ destination, duration, preferences });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        itinerary: result.itinerary,
        aiProvider: result.aiProvider 
      }),
    };
  } catch (err) {
    console.error('Error generating itinerary:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
}

export const handler = async (event) => {
  // Handle OPTIONS for CORS
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  const method = event.requestContext?.http?.method;
  const path = event.rawPath || event.requestContext?.http?.path;

  if (path === '/api/health' && method === 'GET') {
    return handleHealth();
  }

  if (path === '/api/itinerary/generate' && method === 'POST') {
    return handleGenerate(event);
  }

  return {
    statusCode: 404,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Not found' }),
  };
};
