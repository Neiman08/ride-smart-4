import express from 'express';
import { fetchLocalEV } from '../services/locationEngine.js';

const router = express.Router();

function chargeStrategy(station, hour, nearbyDemand = 50) {
  const isPeak = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
  if (isPeak && nearbyDemand > 60)
    return { advice: 'AVOID NOW', reason: 'Peak hours — charge after shift', color: 'red' };
  if (nearbyDemand < 40)
    return { advice: 'GOOD TIME', reason: 'Low demand nearby — safe to charge', color: 'green' };
  return { advice: 'MONITOR', reason: 'Moderate demand — quick charge OK', color: 'amber' };
}

router.get('/', async (req, res) => {
  try {
    const lat    = parseFloat(req.query.lat) || 41.8781;
    const lng    = parseFloat(req.query.lng) || -87.6298;
    const radius = parseInt(req.query.radius) || 20;
    const hour   = new Date().getHours();

    const stations = await fetchLocalEV(lat, lng, radius);
    const enriched = stations.map(s => ({
      ...s,
      strategy: chargeStrategy(s, hour, 50),
    }));

    res.json({
      success:  true,
      total:    enriched.length,
      dcFast:   enriched.filter(s => s.dcFast).length,
      stations: enriched.sort((a, b) => a.distMiles - b.distMiles),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
