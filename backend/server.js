import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'VOYA API running' });
});

app.post('/api/itinerary/generate', async (req, res) => {
  try {
    const { destination, duration, preferences } = req.body;
    
    const prompt = `Create a detailed ${duration}-day travel itinerary for ${destination}. ${preferences ? `Focus on: ${preferences}` : ''}
    
Please provide:
- Day-by-day breakdown
- Must-visit attractions
- Local food recommendations
- Transportation tips
- Estimated costs`;

    const response = await fetch('https://api.bytez.com/models/v2/meta-llama/Llama-3.3-70B-Instruct', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.BYTEZ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful travel planner assistant. Create detailed, practical, and engaging travel itineraries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Bytez API error: ${response.statusText}`);
    }

    const data = await response.json();
    const itinerary = data.choices[0].message.content;

    const { error: dbError } = await supabase
      .from('itineraries')
      .insert([{
        destination,
        duration,
        preferences,
        itinerary,
        created_at: new Date()
      }]);

    if (dbError) console.error('DB Error:', dbError);

    res.json({ success: true, itinerary });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`VOYA API on port ${PORT}`));
