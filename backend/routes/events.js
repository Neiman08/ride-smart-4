/**
 * Ride Smart 4.0 — Events Route
 * Real data from Ticketmaster + SeatGeek (fallback)
 * Each event includes: name, venue, capacity, attendees estimate,
 *   hoursAway, surgeWindow, rideImpact score
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
          // Both music and sports in one call
        },
        timeout: 7000,
      }
    );
    return (data?._embedded?.events || []).map(e => ({
      id:          e.id,
      name:        e.name,
      type:        e.classifications?.[0]?.segment?.name || 'Event',
      subtype:     e.classifications?.[0]?.genre?.name   || '',
      date:        e.dates?.start?.dateTime,
      venueName:   e.venues?.[0]?.name || '',
      venueLat:    parseFloat(e.venues?.[0]?.location?.latitude  || lat),
      venueLng:    parseFloat(e.venues?.[0]?.location?.longitude || lng),
      city:        e.venues?.[0]?.city?.name || '',
      state:       e.venues?.[0]?.state?.stateCode || '',
      // Ticketmaster doesn't expose capacity — use venue type to estimate
      capacity:    estimateCapacity(e.venues?.[0]?.name, e.classifications?.[0]?.segment?.name),
      priceMin:    e.priceRanges?.[0]?.min || null,
      priceMax:    e.priceRanges?.[0]?.max || null,
      url:         e.url,
      imageUrl:    e.images?.[0]?.url || null,
      isReal:      true,
      provider:    'Ticketmaster',
    }));
  } catch(e) { console.warn('[Events] Ticketmaster:', e.message); return null; }
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
      venueLat:    e.venue?.location?.lat || lat,
      venueLng:    e.venue?.location?.lon || lng,
      city:        e.venue?.city || '',
      state:       e.venue?.state || '',
      // SeatGeek has actual capacity!
      capacity:    e.venue?.capacity || estimateCapacity(e.venue?.name, e.type),
      attendees:   e.stats?.listing_count
                     ? Math.round(e.venue?.capacity * 0.80)
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
function estimateCapacity(venueName, type) {
  if (!venueName) return 5000;
  const v = venueName.toLowerCase();
  // Mega venues
  if (v.includes('stadium') || v.includes('bowl') || v.includes('field'))  return 55000;
  if (v.includes('arena') || v.includes('center') || v.includes('garden')) return 20000;
  if (v.includes('amphitheater') || v.includes('amphitheatre'))              return 12000;
  if (v.includes('ballroom') || v.includes('auditorium'))                    return 3000;
  if (v.includes('theatre') || v.includes('theater'))                        return 2500;
  if (v.includes('club') || v.includes('lounge') || v.includes('bar'))       return 800;
  if (v.includes('park') || v.includes('fairground') || v.includes('expo'))  return 30000;
  // By type
  if (type === 'Sports') return 25000;
  if (type === 'Music')  return 8000;
  return 5000;
}

// ── ATTENDEE ESTIMATE ─────────────────────────────────────
// How many people will actually attend (show rate × capacity)
function estimateAttendees(capacity, type, hoursAway) {
  const showRate = type === 'Sports' ? 0.92 :  // sports nearly always sell out
                   type === 'Music'  ? 0.82 : 0.72;
  const urgency  = hoursAway < 0 ? 1.0 : hoursAway < 2 ? 0.95 : hoursAway < 6 ? 0.85 : 0.75;
  return Math.round(capacity * showRate * urgency);
}

// ── RIDE IMPACT SCORE ─────────────────────────────────────
// How much will this event generate rideshare demand?
function rideImpactScore(event) {
  const h        = event.hoursAway;
  const attended = event.attendees || estimateAttendees(event.capacity, event.type, h);
  // 25-40% of concert/sports attendees need a ride each way
  const rideRate = event.type === 'Sports' ? 0.28 : event.type === 'Music' ? 0.32 : 0.22;
  const expectedRiders = Math.round(attended * rideRate);

  // Surge window: 1.5h before to 2h after event
  const inSurge = h >= -2 && h <= 1.5;

  // Score 0-100
  let score = Math.min(100, expectedRiders / 5);
  if (inSurge)         score = Math.min(100, score * 1.4);
  if (attended > 30000) score = Math.min(100, score + 15);
  if (attended > 10000) score = Math.min(100, score + 8);

  return {
    score:           Math.round(score),
    expectedRiders,
    attended,
    inSurgeWindow:   inSurge,
    peakPickupTime:  h < 0 ? 'NOW — event ended' :
                     h < 0.5 ? 'Starting NOW' :
                     `In ${Math.round(h * 60)} min`,
  };
}

// ── MAIN ROUTE ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const lat    = parseFloat(req.query.lat)  || 41.8781;
    const lng    = parseFloat(req.query.lng)  || -87.6298;
    const radius = parseInt(req.query.radius) || 30;

    // Try providers in order
    let events = await fromTicketmaster(lat, lng, radius);
    if (!events) events = await fromSeatGeek(lat, lng, radius);

    // No API keys — return helpful empty response
    if (!events) {
      return res.json({
        success: true, total: 0, events: [],
        surgeActive: false, surgeScore: 0,
        message: 'Add TICKETMASTER_KEY or SEATGEEK_CLIENT_ID to .env for real event data',
        providers: { ticketmaster: !!process.env.TICKETMASTER_KEY, seatgeek: !!process.env.SEATGEEK_CLIENT_ID },
      });
    }

    // Enrich each event
    const now = Date.now();
    const enriched = events
      .map(e => {
        const hoursAway = e.date ? (new Date(e.date) - now) / 3600000 : 99;
        const impact    = rideImpactScore({ ...e, hoursAway });
        const distMiles = haversineMi(lat, lng, e.venueLat, e.venueLng);
        return {
          ...e,
          hoursAway,
          distMiles:       Math.round(distMiles * 10) / 10,
          surgeWindow:     hoursAway >= -2 && hoursAway <= 3,
          attendees:       e.attendees || estimateAttendees(e.capacity, e.type, hoursAway),
          rideImpact:      impact,
          // Human readable
          timing:          hoursAway < -2  ? 'Ended'
                         : hoursAway < 0   ? '🔴 Happening NOW'
                         : hoursAway < 0.5 ? '⚡ Starting NOW'
                         : hoursAway < 2   ? `⚡ In ${Math.round(hoursAway*60)}min`
                         : hoursAway < 12  ? `In ${hoursAway.toFixed(1)}h`
                         : 'Tomorrow+',
        };
      })
      .filter(e => e.hoursAway > -3 && e.hoursAway < 48) // next 48h + recent
      .sort((a, b) => a.hoursAway - b.hoursAway);

    const surgeNow   = enriched.filter(e => e.surgeWindow);
    const totalRiders = surgeNow.reduce((s,e) => s + (e.rideImpact?.expectedRiders||0), 0);

    res.json({
      success:       true,
      total:         enriched.length,
      surgeActive:   surgeNow.length > 0,
      surgeScore:    Math.min(100, Math.round(totalRiders / 10)),
      expectedRiders:totalRiders,
      surgeZones:    [...new Set(surgeNow.map(e => e.city).filter(Boolean))],
      events:        enriched,
      isReal:        events.some(e => e.isReal),
      provider:      events[0]?.provider || 'none',
    });

  } catch (e) {
    console.error('[Events] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
