/**
 * /api/ai/recommendation
 * Crosses all live signals to produce "Go Here Now" recommendation
 * Updates score dynamically — this is the mini analytics engine
 */
import express from 'express';
import { fetchWeatherAt } from '../services/weatherService.js';
import { discoverAirports, discoverZones } from '../services/locationEngine.js';
import { fetchFlightsForAirport } from '../services/flightService.js';

const router = express.Router();

// Special zone types with coordinates and metadata
const ZONE_TYPES = {
  college: [
    { name: 'Northwestern University', lat: 42.0562, lng: -87.6753, boost: 15, hours: [9,12,17,22] },
    { name: 'University of Illinois Chicago', lat: 41.8708, lng: -87.6505, boost: 12 },
    { name: 'DePaul University', lat: 41.9250, lng: -87.6559, boost: 10 },
    { name: 'Loyola University', lat: 42.0011, lng: -87.6581, boost: 10 },
    { name: 'University of Chicago', lat: 41.7886, lng: -87.5987, boost: 12 },
  ],
  hotel: [
    { name: 'River North Hotels', lat: 41.8940, lng: -87.6337, boost: 20 },
    { name: 'Magnificent Mile Hotels', lat: 41.8965, lng: -87.6238, boost: 22 },
    { name: 'Rosemont Hotels (ORD)', lat: 41.9841, lng: -87.8750, boost: 18 },
    { name: 'MDW Hotels', lat: 41.7820, lng: -87.7450, boost: 15 },
    { name: 'Loop Hotels', lat: 41.8781, lng: -87.6298, boost: 16 },
  ],
  nightlife: [
    { name: 'River North Nightlife', lat: 41.8940, lng: -87.6337, boost: 25, hours: [22,23,0,1,2] },
    { name: 'West Loop / Fulton Market', lat: 41.8836, lng: -87.6470, boost: 22, hours: [20,21,22,23,0,1] },
    { name: 'Wicker Park / Bucktown', lat: 41.9088, lng: -87.6786, boost: 20, hours: [21,22,23,0,1,2] },
    { name: 'Lincoln Park', lat: 41.9214, lng: -87.6513, boost: 18, hours: [20,21,22,23,0] },
    { name: 'Boystown / Lakeview', lat: 41.9441, lng: -87.6512, boost: 15, hours: [21,22,23,0,1,2] },
  ],
};

/**
 * Mini analytics engine formula:
 * score = demand + surgeBoost + eventBoost + airportBoost + weatherBoost + nightlifeBoost
 *       - trafficPenalty - distancePenalty - driverDensityPenalty
 */
function scoreZone(zone, context) {
  const { hour, dow, surge, weather, events, airports } = context;
  let score = zone.score || 50; // Base from existing zone intelligence
  const breakdown = [];

  // Surge boost
  if (surge >= 1.5) { score += 15; breakdown.push(`⚡ ${surge}x surge +15`); }
  else if (surge >= 1.2) { score += 8; breakdown.push(`⚡ ${surge}x surge +8`); }

  // Weather boost
  if (weather.rain > 0.5)  { score += 18; breakdown.push('🌧 Rain demand boost +18'); }
  if (weather.snow > 0.1)  { score += 25; breakdown.push('❄️ Snow demand surge +25'); }
  if (weather.temp < 20)   { score += 12; breakdown.push('🥶 Cold weather boost +12'); }
  if (weather.temp > 92)   { score += 10; breakdown.push('🥵 Heat wave boost +10'); }

  // Event boost
  const nearbyEvents = (events || []).filter(e =>
    e.venueLat && Math.abs(e.venueLat - zone.lat) < 0.12 &&
    Math.abs((e.venueLng || e.venueLon) - zone.lng) < 0.12 &&
    e.hoursAway > -1 && e.hoursAway < 4
  );
  if (nearbyEvents.length > 0) {
    const eBoost = Math.min(25, nearbyEvents.length * 10);
    score += eBoost;
    breakdown.push(`🎵 ${nearbyEvents.length} event(s) nearby +${eBoost}`);
  }

  // Airport boost (if zone is near airport)
  const nearAirport = (airports || []).find(a =>
    Math.abs(a.lat - zone.lat) < 0.15 && Math.abs(a.lng - zone.lng) < 0.15
  );
  if (nearAirport && nearAirport.expectedRiders > 20) {
    const aBoost = Math.min(20, Math.round(nearAirport.expectedRiders / 5));
    score += aBoost;
    breakdown.push(`✈️ ${nearAirport.expectedRiders} airport riders +${aBoost}`);
  }

  // Nightlife boost (hour-based)
  const nightHours = [21,22,23,0,1,2];
  if (nightHours.includes(hour)) {
    const nlZone = ZONE_TYPES.nightlife.find(nl =>
      Math.abs(nl.lat - zone.lat) < 0.08 && Math.abs(nl.lng - zone.lng) < 0.08
    );
    if (nlZone) { score += nlZone.boost; breakdown.push(`🌙 Nightlife zone +${nlZone.boost}`); }
  }

  // College boost (class/event hours)
  const collegeHours = [8,9,12,13,17,18,22,23];
  if (collegeHours.includes(hour)) {
    const colZone = ZONE_TYPES.college.find(c =>
      Math.abs(c.lat - zone.lat) < 0.06 && Math.abs(c.lng - zone.lng) < 0.06
    );
    if (colZone) { score += colZone.boost; breakdown.push(`🎓 College zone +${colZone.boost}`); }
  }

  // Hotel boost
  const hotelZone = ZONE_TYPES.hotel.find(h =>
    Math.abs(h.lat - zone.lat) < 0.05 && Math.abs(h.lng - zone.lng) < 0.05
  );
  if (hotelZone) { score += hotelZone.boost / 2; breakdown.push(`🏨 Hotel zone +${Math.round(hotelZone.boost/2)}`); }

  // Driver density penalty (heuristic: high queue = saturated)
  if (zone.airportQueue > 80) { score -= 10; breakdown.push('👥 Queue saturated -10'); }

  // Distance penalty
  if (zone.driveMinutes > 25) { score -= 8; breakdown.push(`🚗 Far: ${zone.driveMinutes}min -8`); }
  else if (zone.driveMinutes > 15) { score -= 3; breakdown.push(`🚗 Moderate distance -3`); }

  return { score: Math.min(100, Math.max(0, Math.round(score))), breakdown };
}

router.get('/', async (req, res) => {
  try {
    const lat  = parseFloat(req.query.lat)  || 41.8781;
    const lng  = parseFloat(req.query.lng)  || -87.6298;
    const hour = new Date().getHours();
    const dow  = new Date().getDay();

    // Load all signals in parallel
    const [weatherRes, zonesRes, eventsRes, airportsRes] = await Promise.allSettled([
      fetchWeatherAt(lat, lng),
      discoverZones(lat, lng, 30).catch(() => []),
      fetch(`http://localhost:${process.env.PORT||3000}/api/events?lat=${lat}&lng=${lng}`).then(r=>r.json()).catch(()=>({events:[]})),
      discoverAirports(lat, lng).catch(() => []),
    ]);

    const weather  = weatherRes.status  === 'fulfilled' ? weatherRes.value  : {};
    const zones    = zonesRes.status    === 'fulfilled' ? zonesRes.value    : [];
    const events   = eventsRes.status   === 'fulfilled' ? (eventsRes.value.events||[]) : [];
    const airports = airportsRes.status === 'fulfilled' ? airportsRes.value : [];

    // Get surge from environment or pattern
    const surgeHours = { 0:1.4,1:1.6,2:1.8,7:1.2,8:1.3,17:1.4,18:1.5,22:1.2,23:1.3 };
    const surge = surgeHours[hour] || 1.0;

    const context = { hour, dow, surge, weather, events, airports };

    // Score all zones
    const scored = zones.map(z => {
      const { score, breakdown } = scoreZone(z, context);
      return {
        name: z.name,
        lat: z.lat,
        lng: z.lng,
        aiScore: score,
        baseScore: z.score,
        estimatedHourly: z.estimatedHourly || Math.round(25 + score * 0.22),
        driveMinutes: z.driveMinutes,
        driveTime: z.driveTime,
        breakdown,
        action: score >= 75 ? 'GO NOW' : score >= 55 ? 'CONSIDER' : 'SKIP',
        confidence: score >= 75 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW',
      };
    }).sort((a, b) => b.aiScore - a.aiScore);

    const best = scored[0];
    if (!best) return res.json({ success: false, error: 'No zones found' });

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      recommendation: {
        zone: best.name,
        lat: best.lat,
        lng: best.lng,
        score: best.aiScore,
        estimatedHourly: best.estimatedHourly,
        driveMinutes: best.driveMinutes,
        driveTime: best.driveTime,
        confidence: best.confidence,
        action: best.action,
        reasons: best.breakdown.slice(0, 4),
        reasoning: best.breakdown.join(' · '),
      },
      allZones: scored.slice(0, 8),
      signals: {
        surge,
        weatherBoost: calculateWeatherBoost(weather),
        eventsNearby: events.filter(e => e.hoursAway > -1 && e.hoursAway < 4).length,
        hour, dow,
      },
      specialZones: {
        nightlife: hour >= 21 || hour <= 2 ? ZONE_TYPES.nightlife.slice(0,3) : [],
        college:   [8,9,12,17,18,22].includes(hour) ? ZONE_TYPES.college.slice(0,3) : [],
        hotel:     ZONE_TYPES.hotel.slice(0,3),
      },
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function calculateWeatherBoost(w) {
  let b = 0;
  if (w.rain > 0.5) b += 25;
  if (w.snow > 0.1) b += 35;
  if (w.temp < 20)  b += 15;
  if (w.temp > 92)  b += 10;
  return b;
}

export default router;
