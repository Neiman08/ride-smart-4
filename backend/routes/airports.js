import express from 'express';
import { discoverAirports } from '../services/locationEngine.js';
import { fetchFlightsForAirport } from '../services/flightService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const hour = new Date().getHours();

    const allAirports = await discoverAirports(lat, lng);

    // ── RIDESHARE FILTER ─────────────────────────────────────
    // Only show commercial passenger airports that generate rideshare demand.
    // Exclude private, executive, general aviation, municipal, cargo-only airports.
    const EXCLUDED_KEYWORDS = [
      'executive', 'municipal', 'private', 'general aviation',
      'flight school', 'cargo', 'charter', 'corporate', 'base',
      'heliport', 'seaplane', 'glider', 'soaring', 'ultralight',
    ];
    // Known rideshare-relevant IATA codes by metro
    const RIDESHARE_IATA = new Set([
      // Chicago
      'ORD','MDW',
      // NYC
      'JFK','LGA','EWR',
      // Los Angeles
      'LAX','BUR','SNA','LGB','ONT',
      // Miami
      'MIA','FLL','PBI',
      // Houston
      'IAH','HOU',
      // Dallas
      'DFW','DAL',
      // Atlanta
      'ATL',
      // Las Vegas
      'LAS',
      // Orlando
      'MCO','SFB',
      // San Francisco Bay
      'SFO','OAK','SJC',
      // Seattle
      'SEA',
      // Denver
      'DEN',
      // Phoenix
      'PHX',
      // Boston
      'BOS',
      // DC
      'DCA','IAD','BWI',
      // Philadelphia
      'PHL',
      // Minneapolis
      'MSP',
      // Detroit
      'DTW',
      // Charlotte
      'CLT',
      // Portland
      'PDX',
      // Salt Lake
      'SLC',
      // Nashville
      'BNA',
      // Austin
      'AUS',
      // San Antonio
      'SAT',
      // New Orleans
      'MSY',
      // Kansas City
      'MCI',
      // St Louis
      'STL',
      // Tampa
      'TPA',
      // San Diego
      'SAN',
      // Honolulu
      'HNL',
      // Anchorage
      'ANC',
    ]);

    const airports = allAirports.filter(a => {
      // Must have a known IATA rideshare code
      if (a.iataCode && RIDESHARE_IATA.has(a.iataCode)) return true;
      // If no IATA, exclude by name keywords
      const nameLower = (a.name || '').toLowerCase();
      if (EXCLUDED_KEYWORDS.some(kw => nameLower.includes(kw))) return false;
      // If it has no IATA code and isn't a known major airport, exclude
      if (!a.iataCode) return false;
      return false;
    });

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
          provider: 'No data',
          dataNote: 'Sin vuelos reales en la ventana seleccionada'
        };

        try {
          if (iata) {
            fd = await fetchFlightsForAirport(iata, airport.lat, airport.lng);
          }
        } catch (e) {
          console.error(`Flight fetch error for ${iata}:`, e.message);
        }

        const hasReal = !!fd.isReal;
        const flights = hasReal ? (fd.flights || []) : [];
        const arrPhr = hasReal ? Number(fd.arrivalsPerHour || 0) : 0;

        const queueLevel = Math.min(
          90,
          30 + (arrPhr * 2) + (peakHour ? 20 : 0) + ((airport.distMiles || 999) < 10 ? 10 : 0)
        );

        const demandScore = Math.min(
          100,
          50 + (arrPhr * 1.5) + (peakHour ? 20 : 0)
        );

        const estimatedHourly = (airport.distMiles || 999) < 15 ? 38 : 34;

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
          passengerLabel: f.passengerLabel || 'Estimated passengers',
          terminal: f.terminal || '',
          gate: f.gate || '',
          baggageBelt: f.baggageBelt || '',
          isReal: !!f.isReal,
          isEstimate: !!f.isEstimate,
          provider: f.provider || fd.provider || 'No data'
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

          passengerLoad: hasReal ? Number(fd.passengerLoad || 0) : 0,
          expectedRiders: hasReal ? Number(fd.expectedRiders || 0) : 0,
          delayedCount: hasReal ? Number(fd.delayedCount || 0) : 0,

          dataNote: hasReal
            ? (fd.dataNote || '📡 Live flight data')
            : 'Sin vuelos reales en la ventana seleccionada',

          provider: hasReal
            ? (fd.provider || 'AeroDataBox')
            : 'No data',

          action:
            queueLevel > 70 ? '⚠️ Queue Full'
            : queueLevel > 40 ? '⚡ Moderate Queue'
            : '✅ Go Now',

          flights: safeFlights,
          hasRealData: safeFlights.some(f => f.isReal && !f.isEstimate)
        };
      })
    );

    // Sort: ORD first, MDW second, then by demand score
    const ORDER = ['ORD','MDW','JFK','LGA','EWR','LAX','MIA','FLL','IAH','HOU','DFW','DAL','ATL','LAS','MCO'];
    enriched.sort((a, b) => {
      const ai = ORDER.indexOf(a.code);
      const bi = ORDER.indexOf(b.code);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b.demandScore - a.demandScore;
    });

    res.json({
      success: true,
      airports: enriched,
      arrivals: (enriched.find(a => a.hasRealData)?.flights || []).slice(0, 8),
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