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

            // Flights API endpoint
app.post('/api/flights/search', async (req, res) => {
  try {
    const { departure_id, arrival_id, outbound_date, return_date, adults, currency, travel_class, stops, sort_by } = req.body;
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    
    if (!SERPAPI_KEY) {
      return res.status(500).json({ error: 'SerpAPI key not configured' });
    }
    
    const params = new URLSearchParams({
      engine: 'google_flights',
      departure_id,
      arrival_id,
      outbound_date,
      currency: currency || 'INR',
      hl: 'en',
      gl: 'in',
      adults: adults || '1',
      travel_class: travel_class || '1',
      stops: stops || '0',
      sort_by: sort_by || '1',
      api_key: SERPAPI_KEY
    });
    
    if (return_date) {
      params.append('return_date', return_date);
      params.append('type', '1');
    } else {
      params.append('type', '2');
    }
    
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await response.json();
    
// Parse SerpAPI response
    const flights = [];
    const allFlights = [...(data.best_flights || []), ...(data.other_flights || [])];
    
    for (const flightGroup of allFlights) {
      if (flightGroup.flights && flightGroup.flights.length > 0) {
        const firstLeg = flightGroup.flights[0];
        const lastLeg = flightGroup.flights[flightGroup.flights.length - 1];
        const price = flightGroup.price || 0;
        flights.push({
          airline: firstLeg.airline || 'Unknown',
          from: firstLeg.departure_airport?.id || departure_id,
          to: lastLeg.arrival_airport?.id || arrival_id,
          departure: firstLeg.departure_airport?.time || 'N/A',
          arrival: lastLeg.arrival_airport?.time || 'N/A',
          duration: flightGroup.total_duration ? `${Math.floor(flightGroup.total_duration / 60)}h` : 'N/A',
          price: price ? `₹${price}` : 'N/A',
          priceNum: price,
          stops: flightGroup.flights.length === 1 ? 'Non-stop' : `${flightGroup.flights.length - 1} stops`
        });
      }
    }
    
    res.json({ flights: flights });  } catch (error) {
    console.error('Flights API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hotels API endpoint
app.post('/api/hotels/search', async (req, res) => {
  try {
    const { q, check_in_date, check_out_date, adults, currency, rating, sort_by } = req.body;
    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    
    if (!SERPAPI_KEY) {
      return res.status(500).json({ error: 'SerpAPI key not configured' });
    }
    
    const params = new URLSearchParams({
      engine: 'google_hotels',
      q: q || 'hotels',
      check_in_date,
      check_out_date,
      currency: currency || 'INR',
      hl: 'en',
      gl: 'in',
      adults: adults || '1',
      api_key: SERPAPI_KEY
    });
    
    if (rating) params.append('rating', rating);
    if (sort_by) params.append('sort_by', sort_by);
    
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await response.json();
    
// Parse SerpAPI hotel response
    const hotels = [];
    const properties = data.properties || [];
    
    for (const hotel of properties) {
      const priceNum = hotel.rate_per_night?.extracted_lowest || 5000;
      const ratingNum = hotel.overall_rating || 4.0;
      
      hotels.push({
        name: hotel.name || 'Hotel',
        location: hotel.neighborhood || hotel.location || 'Unknown',
        rating: `${ratingNum} ★`,
        ratingNum: ratingNum,
        amenities: hotel.amenities ? hotel.amenities.slice(0, 4).join(', ') : 'WiFi',
        price: `₹${priceNum}/night`,
        priceNum: priceNum,
        image: hotel.thumbnail || '🏘'
      });
    }
    
    res.json({ hotels: hotels });  } catch (error) {
    console.error('Hotels API Error:', error);
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, '0.0.0.0', () => console.log(`VOYA API on port ${PORT}`));
