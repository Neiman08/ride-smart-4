/**
 * Ride Smart 4.0 — Events Route
 * Real data from Ticketmaster + SeatGeek (fallback)
 * Each event includes: name, venue, capacity, attendees estimate,
 * hoursAway, surgeWindow, rideImpact score
 */
import express from 'express';
import axios   from 'axios';
import { haversineMi } from '../services/locationEngine.js';

const router = express.Router();

// ── TICKETMASTER (free tier: 5000 req/day) ─────────────────
async function fromTicketmaster(lat, lng, radius) {
  const key = process.env.TICKETMASTER_KEY;
  if (!key) return null;
  try {
    const { data } = await axios.get(
      'https://app.ticketmaster.com/discovery/v2/events.json',
      {
        params: {
          apikey:  key,
          latlong: `${lat},${lng}`,
          radius,
          unit:    'miles',
          size:    50,
          sort:    'date,asc',
        },
        timeout: 7000,
      }
    );

    return (data?._embedded?.events || []).map(e => {
      const venue = e._embedded?.venues?.[0] || {};
    
      return {
        id:        e.id,
        name:      e.name,
        type:      e.classifications?.[0]?.segment?.name || 'Event',
        subtype:   e.classifications?.[0]?.genre?.name || '',
        date:      e.dates?.start?.dateTime,
    
        venueName: venue.name || '',
        venueLat:  venue.location?.latitude ? parseFloat(venue.location.latitude) : null,
        venueLng:  venue.location?.longitude ? parseFloat(venue.location.longitude) : null,
        city:      venue.city?.name || '',
        state:     venue.state?.stateCode || '',
    
        capacity:  estimateCapacity(
          venue.name,
          e.classifications?.[0]?.segment?.name,
          e.classifications?.[0]?.genre?.name
        ),
    
        priceMin:  e.priceRanges?.[0]?.min || null,
        priceMax:  e.priceRanges?.[0]?.max || null,
        url:       e.url,
        imageUrl:  e.images?.[0]?.url || null,
        isReal:    true,
        provider:  'Ticketmaster',
      };
    });
  } catch(e) { 
    console.warn('[Events] Ticketmaster:', e.message); 
    return null; 
  }
}

// ── SEATGEEK (free tier: fallback) ───────────────────────
async function fromSeatGeek(lat, lng, radius) {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) return null;
  try {
    const { data } = await axios.get('https://api.seatgeek.com/2/events', {
      params: {
        client_id: clientId,
        lat, lon: lng,
        range: `${radius}mi`,
        per_page: 50,
        sort: 'datetime_local.asc',
      },
      timeout: 7000,
    });
    return (data?.events || []).map(e => ({
      id:          String(e.id),
      name:        e.title,
      type:        e.type === 'concert' ? 'Music' : e.type === 'sports' ? 'Sports' : 'Event',
      subtype:     e.taxonomies?.[0]?.name || '',
      date:        e.datetime_utc,
      venueName:   e.venue?.name || '',
      venueLat:    e.venue?.location?.lat !== undefined ? e.venue.location.lat : null,
      venueLng:    e.venue?.location?.lon !== undefined ? e.venue.location.lon : null,
      city:        e.venue?.city || '',
      state:       e.venue?.state || '',
      capacity:    e.venue?.capacity || estimateCapacity(e.venue?.name, e.type),
      attendees:   e.stats?.listing_count && e.venue?.capacity
                     ? Math.round(e.venue.capacity * 0.80)
                     : null,
      priceMin:    e.stats?.lowest_price,
      priceMax:    e.stats?.highest_price,
      url:         e.url,
      isReal:      true,
      provider:    'SeatGeek',
    }));
  } catch(e) { console.warn('[Events] SeatGeek:', e.message); return null; }
}

// ── VENUE CAPACITY ESTIMATOR ──────────────────────────────
function estimateCapacity(venueName, type, subtype = '') {
  const v = String(venueName || '').toLowerCase();
  const t = String(type || '').toLowerCase();
  const s = String(subtype || '').toLowerCase();

  if (!v) return 300;

  if (
    v.includes('hotel') || v.includes('inn') || v.includes('suites') ||
    v.includes('motel') || v.includes('marriott') || v.includes('college') ||
    v.includes('school') || v.includes('restaurant') || v.includes('bar') ||
    v.includes('lounge') || v.includes('patio') || v.includes('gastropub')
  ) return 250;

  if (v.includes('guaranteed rate field')) return 40615;
  if (v.includes('wrigley field')) return 41649;
  if (v.includes('united center')) return 23500;
  if (v.includes('soldier field')) return 61500;
  if (v.includes('allstate arena')) return 18500;
  if (v.includes('rosemont theatre')) return 4400;

  if (v.includes('stadium') || v.includes('field')) return 45000;
  if (v.includes('arena')) return 18000;
  if (v.includes('theatre') || v.includes('theater')) return 2500;
  if (v.includes('club')) return 700;
  if (v.includes('expo') || v.includes('convention')) return 8000;

  if (t.includes('sports')) return 12000;
  if (t.includes('music')) return 1200;
  if (t.includes('arts') || s.includes('theatre')) return 900;

  return 300;
}

// ── ATTENDEE ESTIMATE ─────────────────────────────────────
function estimateAttendees(capacity, type, hoursAway) {
  const showRate = type === 'Sports' ? 0.92 : type === 'Music' ? 0.82 : 0.72;
  const urgency  = hoursAway < 0 ? 1.0 : hoursAway < 2 ? 0.95 : hoursAway < 6 ? 0.85 : 0.75;
  return Math.round(capacity * showRate * urgency);
}

// ── RIDE IMPACT SCORE ─────────────────────────────────────
function rideImpactScore(event) {
  const h = event.hoursAway;
  const attended = event.attendees || estimateAttendees(event.capacity, event.type, h);
  const rideRate = event.type === 'Sports' ? 0.28 : event.type === 'Music' ? 0.32 : 0.22;
  const expectedRiders = Math.round(attended * rideRate);
  const inSurge = h >= -2 && h <= 1.5;

  let score = Math.min(100, expectedRiders / 5);
  if (inSurge) score = Math.min(100, score * 1.4);
  if (attended > 30000) score = Math.min(100, score + 15);
  if (attended > 10000) score = Math.min(100, score + 8);

  return {
    score: Math.round(score),
    expectedRiders,
    attended,
    inSurgeWindow: inSurge,
    peakPickupTime: h < 0 ? 'NOW — event ended' : h < 0.5 ? 'Starting NOW' : `In ${Math.round(h * 60)} min`,
  };
}

// ── MAIN ROUTE ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const lat    = parseFloat(req.query.lat)  || 41.8781;
    const lng    = parseFloat(req.query.lng)  || -87.6298;
    const radius = parseInt(req.query.radius) || 30;

    let events = await fromTicketmaster(lat, lng, radius);
    if (!events) events = await fromSeatGeek(lat, lng, radius);

    if (!events) {
      return res.json({
        success: true, total: 0, events: [],
        surgeActive: false, surgeScore: 0,
        message: 'Add API keys to .env',
        providers: { ticketmaster: !!process.env.TICKETMASTER_KEY, seatgeek: !!process.env.SEATGEEK_CLIENT_ID },
      });
    }

    const now = Date.now();
    const cleanEvents = events
      .map(e => {
        const hoursAway = e.date ? (new Date(e.date) - now) / 3600000 : 99;
        const attendees = e.attendees || estimateAttendees(e.capacity, e.type, hoursAway);
        const impact    = rideImpactScore({ ...e, hoursAway, attendees });
        
        const distMiles = (e.venueLat !== null && e.venueLng !== null) 
          ? haversineMi(lat, lng, e.venueLat, e.venueLng) 
          : 999;
        
        return {
          ...e,
          hoursAway,
          distMiles:   Math.round(distMiles * 10) / 10,
          surgeWindow: hoursAway >= -2 && hoursAway <= 3,
          attendees,
          rideImpact:  impact,
          timing:      hoursAway < -2  ? 'Ended'
                       : hoursAway < 0   ? '🔴 Happening NOW'
                       : hoursAway < 0.5 ? '⚡ Starting NOW'
                       : hoursAway < 2   ? `⚡ In ${Math.round(hoursAway*60)}min`
                       : hoursAway < 12  ? `In ${hoursAway.toFixed(1)}h`
                       : 'Tomorrow+',
        };
      })
      .filter(e => {
        // Ajuste: Permitir coordenadas 0 pero rechazar null/undefined
        if (!e.venueName || e.venueLat === null || e.venueLng === null) return false;

        if (!(e.hoursAway > -3 && e.hoursAway < 48)) return false;

        const venue = (e.venueName || '').toLowerCase();
        const isBigVenue =
          venue.includes('stadium') ||
          venue.includes('arena') ||
          venue.includes('field') ||
          venue.includes('center') ||
          venue.includes('theatre') ||
          venue.includes('theater') ||
          venue.includes('amphitheater');

        if (e.attendees > 30000 && !isBigVenue) return false;

        return true;
      })
      .sort((a, b) => a.hoursAway - b.hoursAway);

    const surgeNow   = cleanEvents.filter(e => e.surgeWindow);
    const totalRiders = surgeNow.reduce((s,e) => s + (e.rideImpact?.expectedRiders||0), 0);

    res.json({
      success:       true,
      total:         cleanEvents.length,
      surgeActive:   surgeNow.length > 0,
      surgeScore:    Math.min(100, Math.round(totalRiders / 10)),
      expectedRiders:totalRiders,
      surgeZones:    [...new Set(surgeNow.map(e => e.city).filter(Boolean))],
      events:        cleanEvents,
      isReal:        events.some(e => e.isReal),
      provider:      events[0]?.provider || 'none',
    });

  } catch (e) {
    console.error('[Events] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
