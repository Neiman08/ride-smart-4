/**
 * Ride Smart 4.0 — Location Engine
 *
 * Given any lat/lng in the US, this engine:
 * 1. Reverse geocodes the city/metro
 * 2. Discovers nearby airports (FAA data)
 * 3. Generates demand zones dynamically via Google Places
 * 4. Fetches local events via Ticketmaster
 * 5. Fetches local EV stations via NREL
 * 6. Returns everything scoped to that location
 *
 * Works for ANY US city — Chicago, NYC, LA, Miami, Houston, etc.
 */

import axios from 'axios';

// ── REVERSE GEOCODE ─────────────────────────────────────────
export async function reverseGeocode(lat, lng) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return buildFallback(lat, lng);
    const { data } = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`,
      { timeout: 5000 }
    );
    const results = data.results || [];
    let city = '', state = '', metro = '', zip = '';
    for (const r of results) {
      for (const c of r.address_components) {
        if (c.types.includes('locality'))                    city  = c.long_name;
        if (c.types.includes('administrative_area_level_1')) state = c.short_name;
        if (c.types.includes('administrative_area_level_2')) metro = c.long_name;
        if (c.types.includes('postal_code'))                 zip   = c.long_name;
      }
      if (city && state) break;
    }
    return { city, state, metro, zip, lat, lng,
             label: city ? `${city}, ${state}` : `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
  } catch {
    return buildFallback(lat, lng);
  }
}

function buildFallback(lat, lng) {
  return { city: 'Unknown', state: '', metro: '', zip: '', lat, lng,
           label: `${lat.toFixed(2)}, ${lng.toFixed(2)}` };
}

// ── DISCOVER NEARBY AIRPORTS ────────────────────────────────
// Uses Google Places to find airports within 60 miles
export async function discoverAirports(lat, lng) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return [];
    const { data } = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
      {
        params: {
          location: `${lat},${lng}`,
          radius:   96560, // 60 miles in meters
          type:     'airport',
          key,
        },
        timeout: 6000,
      }
    );
    return (data.results || [])
      .filter(p => p.name.length > 3)
      .slice(0, 4)
      .map(p => ({
        name:     p.name,
        placeId:  p.place_id,
        lat:      p.geometry.location.lat,
        lng:      p.geometry.location.lng,
        isAirport: true,
        iataCode: extractIATA(p.name),
        distMiles: haversineMi(lat, lng, p.geometry.location.lat, p.geometry.location.lng),
        driveMinutes: Math.round(haversineMi(lat, lng, p.geometry.location.lat, p.geometry.location.lng) * 2.2),
      }))
      .filter(a => a.distMiles <= 60);
  } catch {
    return [];
  }
}

function extractIATA(name) {
  // Common airport name → IATA code mapping
  const map = {
    "o'hare": 'ORD', 'ohare': 'ORD', 'midway': 'MDW',
    "laguardia": 'LGA', 'kennedy': 'JFK', "jfk": 'JFK', 'newark': 'EWR',
    'lax': 'LAX', 'los angeles': 'LAX', 'burbank': 'BUR', 'long beach': 'LGB',
    'miami': 'MIA', 'fort lauderdale': 'FLL', 'palm beach': 'PBI',
    'dallas fort worth': 'DFW', 'love field': 'DAL',
    'houston': 'IAH', 'hobby': 'HOU',
    "o'hare international": 'ORD', 'hartsfield': 'ATL', 'atlanta': 'ATL',
    'phoenix': 'PHX', 'sky harbor': 'PHX',
    'seattle': 'SEA', 'tacoma': 'SEA',
    'denver': 'DEN', 'minneapolis': 'MSP',
    'boston': 'BOS', 'logan': 'BOS',
    'philadelphia': 'PHL', 'reagan': 'DCA', 'dulles': 'IAD', 'bwi': 'BWI',
    'charlotte': 'CLT', 'detroit': 'DTW',
    'san francisco': 'SFO', 'san jose': 'SJC', 'oakland': 'OAK',
    'las vegas': 'LAS', 'mccarran': 'LAS',
    'orlando': 'MCO', 'tampa': 'TPA',
    'portland': 'PDX', 'salt lake': 'SLC',
    'new orleans': 'MSY', 'memphis': 'MEM', 'nashville': 'BNA',
    'kansas city': 'MCI', 'st louis': 'STL', 'cleveland': 'CLE',
    'pittsburgh': 'PIT', 'indianapolis': 'IND', 'columbus': 'CMH',
    'richmond': 'RIC', 'norfolk': 'ORF', 'raleigh': 'RDU',
    'austin': 'AUS', 'san antonio': 'SAT', 'el paso': 'ELP',
    'albuquerque': 'ABQ', 'tucson': 'TUS',
    'sacramento': 'SMF', 'fresno': 'FAT',
    'honolulu': 'HNL', 'anchorage': 'ANC',
  };
  const lower = name.toLowerCase();
  for (const [k, code] of Object.entries(map)) {
    if (lower.includes(k)) return code;
  }
  return null;
}

// ── DISCOVER DEMAND ZONES via Google Places ─────────────────
// Finds high-demand areas near the driver dynamically
export async function discoverZones(lat, lng, radiusMiles = 25) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  // Place types that indicate rideshare demand
  const searches = [
    { type: 'stadium',        label: 'Sports Venue' },
    { type: 'university',     label: 'University' },
    { type: 'shopping_mall',  label: 'Shopping' },
    { type: 'convention_center', label: 'Convention' },
    { type: 'hospital',       label: 'Medical' },
    { type: 'train_station',  label: 'Transit Hub' },
    { type: 'night_club',     label: 'Nightlife' },
    { type: 'casino',         label: 'Casino' },
  ];

  const zones = [];
  const seen = new Set();
  const radiusM = Math.min(radiusMiles * 1609, 50000); // max 50km for Places API

  for (const search of searches) {
    try {
      const { data } = await axios.get(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
        {
          params: { location: `${lat},${lng}`, radius: radiusM, type: search.type, key },
          timeout: 5000,
        }
      );
      for (const place of (data.results || []).slice(0, 3)) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);
        const plat = place.geometry.location.lat;
        const plng = place.geometry.location.lng;
        const dist = haversineMi(lat, lng, plat, plng);
        if (dist > radiusMiles) continue;
        zones.push({
          name:        place.name,
          lat:         plat,
          lng:         plng,
          placeId:     place.place_id,
          type:        search.label,
          isAirport:   false,
          distMiles:   Math.round(dist * 10) / 10,
          driveMinutes:Math.round(dist * 2.2),
          distance:    dist.toFixed(1) + ' mi',
          rating:      place.rating || 0,
          vicinity:    place.vicinity || '',
        });
      }
    } catch { /* continue */ }
  }

  // Deduplicate by proximity (merge zones within 0.5 miles)
  const deduped = [];
  for (const z of zones) {
    const near = deduped.find(d => haversineMi(z.lat, z.lng, d.lat, d.lng) < 0.5);
    if (!near) deduped.push(z);
  }

  return deduped.sort((a, b) => a.distMiles - b.distMiles).slice(0, 15);
}


// ── LOCAL EVENTS via Ticketmaster ───────────────────────────
export async function fetchLocalEvents(lat, lng, radiusMiles = 30) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return [];
  try {
    const { data } = await axios.get(
      `https://app.ticketmaster.com/discovery/v2/events.json`,
      {
        params: {
          apikey: key,
          latlong: `${lat},${lng}`,
          radius: radiusMiles,
          unit: 'miles',
          size: 20,
          sort: 'date,asc',
          classificationName: 'music,sports',
        },
        timeout: 6000,
      }
    );
    return (data?._embedded?.events || []).map(e => ({
      id:       e.id,
      name:     e.name,
      type:     e.classifications?.[0]?.segment?.name || 'Event',
      date:     e.dates?.start?.dateTime,
      venue:    e.venues?.[0]?.name || 'Unknown',
      venueLat: parseFloat(e.venues?.[0]?.location?.latitude || lat),
      venueLng: parseFloat(e.venues?.[0]?.location?.longitude || lng),
      city:     e.venues?.[0]?.city?.name || '',
      capacity: parseInt(e.venues?.[0]?.capacity || 0),
      distMiles: haversineMi(lat, lng,
        parseFloat(e.venues?.[0]?.location?.latitude || lat),
        parseFloat(e.venues?.[0]?.location?.longitude || lng)),
      hoursAway: (new Date(e.dates?.start?.dateTime) - Date.now()) / 3600000,
    })).filter(e => e.distMiles <= radiusMiles);
  } catch { return []; }
}

// ── LOCAL EV STATIONS via NREL ──────────────────────────────
export async function fetchLocalEV(lat, lng, radiusMiles = 20) {
  try {
    const key = process.env.NREL_API_KEY || 'DEMO_KEY';
    const { data } = await axios.get(
      `https://developer.nrel.gov/api/alt-fuel-stations/v1.json`,
      {
        params: {
          api_key:    key,
          fuel_type:  'ELEC',
          latitude:   lat,
          longitude:  lng,
          radius:     radiusMiles,
          limit:      15,
          ev_level3_evse_num: 1, // DC fast only
          status:     'E', // open
        },
        timeout: 5000,
      }
    );
    return (data.fuel_stations || []).map(s => ({
      id:      String(s.id),
      name:    s.station_name,
      address: `${s.street_address}, ${s.city}`,
      lat:     s.latitude,
      lng:     s.longitude,
      level:   s.ev_level3_evse_num > 0 ? 3 : 2,
      ports:   (s.ev_level3_evse_num || 0) + (s.ev_level2_evse_num || 0),
      network: s.ev_network || 'Unknown',
      dcFast:  s.ev_level3_evse_num > 0,
      distMiles: haversineMi(lat, lng, s.latitude, s.longitude),
      estimatedWait: s.ev_level3_evse_num > 0 ? '20-30 min' : '45-90 min',
    }));
  } catch { return []; }
}

// ── LOCAL WEATHER ───────────────────────────────────────────
export async function fetchWeatherAt(lat, lng) {
  try {
    const key = process.env.OPENWEATHER_API_KEY;
    if (!key) return { temp: 72, desc: 'Clear', rain: 0, score: 60, rainIntensity: 0 };
    const { data } = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=imperial`,
      { timeout: 4000 }
    );
    const rain = data.rain?.['1h'] || 0;
    return {
      temp:         Math.round(data.main.temp),
      desc:         data.weather[0].description,
      rain,
      wind:         Math.round(data.wind.speed),
      score:        rain > 2 ? 95 : rain > 0.5 ? 80 : data.clouds.all > 70 ? 65 : 55,
      rainIntensity:Math.min(100, rain * 30),
      city:         data.name,
    };
  } catch { return { temp: 72, desc: 'N/A', rain: 0, score: 60, rainIntensity: 0, city: '' }; }
}

// ── HAVERSINE DISTANCE ──────────────────────────────────────
export function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * Math.PI / 180; }
