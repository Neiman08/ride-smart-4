import express from 'express';
import { fetchWeatherAt } from '../services/weatherService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const w = await fetchWeatherAt(lat, lng);
    
    // Demand impact calculation
    const impact = calculateWeatherImpact(w);
    
    res.json({
      success: true,
      weather: {
        temp: w.temp,
        feelsLike: w.feelsLike,
        desc: w.desc,
        icon: w.icon,
        humidity: w.humidity,
        windSpeed: w.windSpeed,
        rain: w.rain || 0,
        snow: w.snow || 0,
        visibility: w.visibility,
        condition: w.condition,
      },
      demandImpact: impact,
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function calculateWeatherImpact(w) {
  let boost = 0;
  let reasons = [];
  
  if (w.rain > 0.5)  { boost += 25; reasons.push('Rain increases demand 20-30%'); }
  if (w.snow > 0.1)  { boost += 35; reasons.push('Snow drives highest demand spikes'); }
  if (w.temp < 15)   { boost += 20; reasons.push('Extreme cold reduces walking'); }
  if (w.temp > 95)   { boost += 15; reasons.push('Heat wave pushes riders indoors'); }
  if (w.windSpeed > 25) { boost += 10; reasons.push('High winds reduce walking'); }
  
  return {
    boost,
    multiplier: (1 + boost / 100).toFixed(2),
    reasons,
    label: boost >= 30 ? 'HIGH BOOST' : boost >= 15 ? 'MODERATE BOOST' : 'NORMAL',
    color: boost >= 30 ? 'green' : boost >= 15 ? 'amber' : 'muted',
  };
}

export default router;
