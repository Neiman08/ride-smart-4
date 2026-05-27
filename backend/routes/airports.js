import express from 'express';
import { discoverAirports }         from '../services/locationEngine.js';
import { fetchRealArrivals, getArrivalsPerHour } from '../services/flightService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const hour = new Date().getHours();

    // Discover airports near driver (Google Places, up to 60 miles)
    const airports = await discoverAirports(lat, lng);

    if (!airports.length) {
      return res.json({ success: true, airports: [], arrivals: [],
        message: 'No airports found within 60 miles.' });
    }

    // Enrich each airport with real flight data
    const enriched = await Promise.all(airports.map(async airport => {
      const iata    = airport.iataCode;
      const flights = iata ? await fetchRealArrivals(iata) : [];
      const arrPhr  = iata ? await getArrivalsPerHour(iata)
                           : (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19) ? 14 : 8;

      // Queue level based on real arrivals + time of day
      const peakHour   = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
      const queueLevel = Math.min(90,
        30 + (arrPhr * 2) + (peakHour ? 20 : 0) + (airport.distMiles < 10 ? 10 : 0));
      const demandScore = Math.min(100,
        50 + (arrPhr * 1.5) + (peakHour ? 20 : 0));
      const estimatedHourly = airport.distMiles < 15 ? 38 : 34;

      return {
        code:           iata || airport.name?.slice(0, 3).toUpperCase() || '???',
        name:           airport.name,
        lat:            airport.lat,
        lng:            airport.lng,
        distMiles:      Math.round(airport.distMiles * 10) / 10,
        driveMinutes:   airport.driveMinutes,
        arrivalsPerHour: arrPhr,
        queueLevel,
        demandScore,
        estimatedHourly,
        action: queueLevel > 70 ? '⚠️ Queue Full'
              : queueLevel > 40 ? '⚡ Moderate Queue'
              : '✅ Go Now',
        flights: flights.slice(0, 15),
        hasRealData: flights.length > 0 && !flights[0]?.isEstimate,
      };
    }));

    // Sort by demand score
    enriched.sort((a, b) => b.demandScore - a.demandScore);

    res.json({
      success:  true,
      airports: enriched,
      arrivals: enriched[0]?.flights || [],
      hasRealFlightData: enriched.some(a => a.hasRealData),
    });

  } catch (e) {
    console.error('airports error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
