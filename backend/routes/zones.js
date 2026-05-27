/**
 * Ride Smart 4.0 — Zones Route v2
 * Now crosses flight passenger data + event attendees into zone scores
 */
import express from 'express';
import axios   from 'axios';
import { calculateZoneScore, predictHourly } from '../services/intelligenceEngine.js';
import { reverseGeocode, discoverAirports, discoverZones, fetchWeatherAt } from '../services/locationEngine.js';
import { fetchFlightsForAirport } from '../services/flightService.js';

const router = express.Router();

async function trafficScore(oLat, oLng, dLat, dLng) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return 50;
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: { origins:`${oLat},${oLng}`, destinations:`${dLat},${dLng}`, departure_time:'now', key },
      timeout: 4000,
    });
    const el = data?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK') return 50;
    return Math.min(100, Math.round(((el.duration_in_traffic.value / el.duration.value) - 1) * 200));
  } catch { return 50; }
}

router.get('/', async (req, res) => {
  try {
    const lat  = parseFloat(req.query.lat)  || 41.8781;
    const lng  = parseFloat(req.query.lng)  || -87.6298;
    const hour = new Date().getHours();
    const dow  = new Date().getDay();

    // Parallel: location, airports, zones, weather
    const [location, airports, places, weather] = await Promise.all([
      reverseGeocode(lat, lng),
      discoverAirports(lat, lng),
      discoverZones(lat, lng, 30),
      fetchWeatherAt(lat, lng),
    ]);

    // Fetch flight data for all airports (passenger counts)
    const flightData = {};
    await Promise.all(airports.map(async a => {
      if (!a.iataCode) return;
      flightData[a.name] = await fetchFlightsForAirport(a.iataCode, a.lat, a.lng)
        .catch(() => ({ flights:[], arrivalsPerHour:0, passengerLoad:0, expectedRiders:0, delayedCount:0 }));
    }));

    // Fetch nearby events (for attendee counts)
    let nearbyEvents = [];
    try {
      const evRes = await fetch(`http://localhost:${process.env.PORT||3000}/api/events?lat=${lat}&lng=${lng}&radius=20`);
      const evData = await evRes.json();
      nearbyEvents = evData.events || [];
    } catch { /* events optional */ }

    const allZones = [
      ...airports.map(a => ({ ...a, category:'airport' })),
      ...places.map(p => ({ ...p, category:p.type })),
    ].sort((a,b) => a.distMiles - b.distMiles).slice(0, 18);

    const peakHour = (() => {
      if (hour >= 7  && hour <= 9)  return 80;
      if (hour >= 16 && hour <= 19) return 90;
      if (hour >= 22 || hour <= 2)  return 75;
      if (dow === 5 || dow === 6)   return 70;
      return 50;
    })();

    const scored = await Promise.all(allZones.map(async zone => {
      const traffic = await trafficScore(lat, lng, zone.lat, zone.lng).catch(() => 50);

      // Flight data for this zone
      const fd = flightData[zone.name] || { arrivalsPerHour:0, passengerLoad:0, expectedRiders:0, delayedCount:0 };
      const flightScore = zone.isAirport
        ? Math.min(100, 40 + fd.arrivalsPerHour * 2 + (peakHour * 0.2))
        : 0;

      // Event data for this zone (events within 5 miles)
      const zoneEvents = nearbyEvents.filter(e =>
        e.venueLat && e.venueLng &&
        Math.abs(e.venueLat - zone.lat) < 0.1 &&
        Math.abs(e.venueLng - zone.lng) < 0.1
      );
      const totalAttendees   = zoneEvents.reduce((s,e) => s + (e.attendees||0), 0);
      const totalEventRiders = zoneEvents.reduce((s,e) => s + (e.rideImpact?.expectedRiders||0), 0);
      const eventRideImpact  = zoneEvents.reduce((s,e) => s + (e.rideImpact?.score||0), 0);
      const eventSurgeActive = zoneEvents.some(e => e.surgeWindow);

      const baseHourly = zone.isAirport ? 36 : zone.type==='Stadium'?34:zone.type==='University'?28:zone.type==='Nightlife'?32:26;
      const estHourly  = Math.round(baseHourly * (1+(peakHour-50)/200) * (dow>=5?1.1:1));
      const predHourly = predictHourly({ estimatedHourly:estHourly, historicHourly:baseHourly,
        surgeMultiplier:1, concerts:eventSurgeActive?80:0, flights:flightScore, passengerLoad:fd.passengerLoad }, hour, dow);

      const raw = {
        ...zone,
        flights:         flightScore,
        traffic,
        weather:         weather.score,
        rainIntensity:   weather.rainIntensity || 0,
        peakHour,
        estimatedDemand: Math.min(95, 40 + peakHour*0.3 + (zone.isAirport?15:0) + (totalAttendees>1000?15:0)),
        driverSaturation:Math.min(80, 40 + peakHour*0.2),
        estimatedHourly: estHourly,
        predictedHourly: predHourly,
        historicHourly:  baseHourly,
        airportQueue:    zone.isAirport ? Math.min(100, flightScore*0.8+peakHour*0.2) : 0,
        surgeMultiplier: peakHour>=80?1.3:peakHour>=65?1.15:1.0,
        evChargingNear:  zone.distMiles<=5,
        // NEW: real passenger + event data
        passengerLoad:        fd.passengerLoad,
        expectedFlightRiders: fd.expectedRiders,
        delayedFlights:       fd.delayedCount || 0,
        eventAttendees:       totalAttendees,
        expectedEventRiders:  totalEventRiders,
        eventRideImpact,
        hasLiveFlightData:    fd.isReal || false,
      };

      const sc = calculateZoneScore(raw);
      return {
        ...raw, ...sc,
        driveTime: zone.driveMinutes + ' min',
        // Demand summary for UI
        demandSummary: buildDemandSummary(fd, totalAttendees, totalEventRiders, zoneEvents),
      };
    }));

    res.json({
      success:          true,
      location:         location.label,
      city:             location.city,
      state:            location.state,
      driverLat:        lat,
      driverLng:        lng,
      weather:          `${weather.desc} ${weather.temp}°F${weather.rain>0?' · 🌧️ Rain':''}`,
      weatherData:      weather,
      airportsFound:    airports.length,
      zonesFound:       scored.length,
      bestZones:        scored.sort((a,b) => b.score-a.score),
      totalExpectedRiders: scored.reduce((s,z) => s+(z.expectedFlightRiders||0)+(z.expectedEventRiders||0), 0),
    });
  } catch(e) {
    console.error('zones error:', e.message);
    res.status(500).json({ success:false, error:e.message });
  }
});

function buildDemandSummary(fd, attendees, eventRiders, events) {
  const parts = [];
  if (fd.passengerLoad > 0)    parts.push(`✈️ ~${fd.passengerLoad} pax arriving`);
  if (fd.expectedRiders > 0)   parts.push(`~${fd.expectedRiders} need rides`);
  if (fd.delayedCount > 0)     parts.push(`${fd.delayedCount} delays`);
  if (attendees > 0)           parts.push(`🎵 ~${attendees.toLocaleString()} event attendees`);
  if (eventRiders > 0)         parts.push(`~${eventRiders} event riders`);
  if (events.length > 0) {
    const ev = events[0];
    parts.push(ev.name?.substring(0,30) + (ev.name?.length>30?'…':''));
  }
  return parts.join(' · ') || null;
}

export default router;
