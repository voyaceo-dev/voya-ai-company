import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bytezApiKey = process.env.BYTEZ_API_KEY;
const corsOrigin = process.env.CORS_ORIGIN || '*';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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
    }),
  };
}

async function generateItinerary({ destination, duration, preferences }) {
  const prompt =
    `Create a detailed ${duration}-day travel itinerary for ${destination}. ` +
    (preferences ? `Focus on: ${preferences}. ` : '') +
    '\n\nPlease provide:\n- Day-by-day breakdown\n- Must-visit attractions\n- Local food recommendations\n- Transportation tips\n- Estimated costs';

  const response = await fetch(
    'https://api.bytez.com/models/v2/google/gemma-2-2b-it/chat
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${bytezApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful travel planner assistant. Create detailed, practical, and engaging travel itineraries.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Bytez API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const itinerary = data.choices?.[0]?.message?.content ?? '';

  const { error: dbError } = await supabase
    .from('itineraries')
    .insert([{ destination, duration, preferences, itinerary, created_at: new Date().toISOString() }]);

  if (dbError) {
    console.error('Supabase error:', dbError);
  }

  return itinerary;
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
    const itinerary = await generateItinerary({ destination, duration, preferences });
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, itinerary }),
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

