import express from 'express';
import { discoverAirports } from '../services/locationEngine.js';
import { fetchFlightsForAirport } from '../services/flightService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const hour = new Date().getHours();

    const airports = await discoverAirports(lat, lng);

    if (!airports.length) {
      return res.json({
        success: true,
        airports: [],
        arrivals: [],
        message: 'No airports found within 60 miles.'
      });
    }

    const enriched = await Promise.all(
      airports.map(async (airport) => {
        const iata = airport.iataCode;
        const peakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);

        let fd = {
          flights: [],
          arrivalsPerHour: 0,
          passengerLoad: 0,
          expectedRiders: 0,
          delayedCount: 0,
          isReal: false,
          dataNote: '📊 Estimated flight pattern'
        };

        try {
          if (iata) {
            fd = await fetchFlightsForAirport(iata, airport.lat, airport.lng);
          }
        } catch (e) {
          console.error(`Flight fetch error for ${iata}:`, e.message);
        }

        const flights = fd.flights || [];
        const arrPhr = fd.arrivalsPerHour || (peakHour ? 10 : 6);

        const queueLevel = Math.min(
          90,
          30 + (arrPhr * 2) + (peakHour ? 20 : 0) + ((airport.distMiles || 999) < 10 ? 10 : 0)
        );

        const demandScore = Math.min(
          100,
          50 + (arrPhr * 1.5) + (peakHour ? 20 : 0)
        );

        const estimatedHourly =
          (airport.distMiles || 999) < 15 ? 38 : 34;

        const safeFlights = flights.slice(0, 8).map(f => ({
          flightNumber: f.flightNumber || '--',
          airline: f.airline || '--',
          origin: f.origin || '--',
          originCity: f.originCity || f.origin || '--',
          destination: f.destination || iata || '--',
          status: f.status || 'Scheduled',
          scheduledTime: f.scheduledTime || '--',
          delayMinutes: Number(f.delayMinutes || 0),
          aircraftType: f.aircraftType || '',
          passengerCount: Number(f.passengerCount || 0),
          passengerLabel: f.passengerLabel || 'Estimated capacity',
          terminal: f.terminal || '',
          isReal: !!f.isReal,
          isEstimate: !!f.isEstimate,
          provider: f.provider || fd.provider || 'Smart Estimate'
        }));

        return {
          code: iata || airport.name?.slice(0, 3).toUpperCase() || '???',
          name: airport.name,
          lat: airport.lat,
          lng: airport.lng,
          distMiles: Math.round((airport.distMiles || 0) * 10) / 10,
          driveMinutes: airport.driveMinutes || null,

          arrivalsPerHour: arrPhr,
          queueLevel,
          demandScore,
          estimatedHourly,

          passengerLoad: Number(fd.passengerLoad || 0),
          expectedRiders: Number(fd.expectedRiders || 0),
          delayedCount: Number(fd.delayedCount || 0),
          dataNote: fd.dataNote || '📊 Estimated flight pattern',
          provider: fd.provider || 'Smart Estimate',

          action:
            queueLevel > 70 ? '⚠️ Queue Full'
            : queueLevel > 40 ? '⚡ Moderate Queue'
            : '✅ Go Now',

          flights: safeFlights,
          hasRealData: safeFlights.some(f => f.isReal && !f.isEstimate)
        };
      })
    );

    enriched.sort((a, b) => b.demandScore - a.demandScore);

    res.json({
      success: true,
      airports: enriched,
      arrivals: (enriched[0]?.flights || []).slice(0, 8),
      hasRealFlightData: enriched.some(a => a.hasRealData)
    });

  } catch (e) {
    console.error('airports error:', e.message);

    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

export default router;