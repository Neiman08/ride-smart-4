/**
 * Ride Smart 4.0 — Flight Intelligence Service
 * Ventana: próximas 3 horas de vuelos reales
 * * Actualizaciones: 
 * 1. Cache TTL extendido a 10 min.
 * 2. Logging detallado en errores de red/API.
 */

import axios from 'axios';

// ── CACHE STORAGE ─────────────────────────────────────────
const flightCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos de validez

function getCachedFlights(iata) {
  const cached = flightCache.get(iata);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return { ...cached.data, fromCache: true };
  }
  return null;
}

function saveFlightsCache(iata, data) {
  flightCache.set(iata, {
    timestamp: Date.now(),
    data: data
  });
}

// ── AIRCRAFT CAPACITY ─────────────────────────────────────
const AC_CAP = {
  '737':155,'73H':155,'73G':136,'738':162,'739':178,'73W':143,'7M8':178,'7M9':193,
  '319':120,'320':150,'321':185,'32A':150,'32B':165,'32N':165,'32Q':194,'32S':180,
  'E70':70,'E75':76,'E7W':76,'E90':98,'E95':110,'E75L':76,
  'CR2':50,'CR7':70,'CR9':90,'CRJ':50,'CRK':90,
  '757':180,'75W':180,'764':250,'767':250,'76W':218,
  '772':305,'773':368,'77W':350,'777':350,
  '787':242,'788':242,'789':290,'78X':320,
  '380':525,'388':525,'747':410,'74H':412,
  'AT7':72,'AT5':50,'DH8':78,
};

function pax(aircraftText, capacityFromApi) {
  if (Number(capacityFromApi) > 0) return Math.round(Number(capacityFromApi) * 0.84);
  const key = String(aircraftText || '').toUpperCase();

  if (key.includes('737 MAX 10') || key.includes('737-10'))                        return Math.round(230 * 0.84);
  if (key.includes('737 MAX 9')  || key.includes('737-9')  || key.includes('7M9')) return Math.round(193 * 0.84);
  if (key.includes('737 MAX 8')  || key.includes('737-8')  || key.includes('7M8')) return Math.round(178 * 0.84);
  if (key.includes('737 MAX 7')  || key.includes('737-7'))                         return Math.round(153 * 0.84);
  if (key.includes('737-900') || key.includes('739')) return Math.round(180 * 0.84);
  if (key.includes('737-800') || key.includes('73H')) return Math.round(162 * 0.84);
  if (key.includes('737-700') || key.includes('73G')) return Math.round(143 * 0.84);
  if (key.includes('737'))                            return Math.round(155 * 0.84);

  if (key.includes('A321XLR') || key.includes('A321NEO')) return Math.round(220 * 0.84);
  if (key.includes('A321'))    return Math.round(185 * 0.84);
  if (key.includes('A320NEO')) return Math.round(165 * 0.84);
  if (key.includes('A320'))    return Math.round(150 * 0.84);
  if (key.includes('A319'))    return Math.round(128 * 0.84);
  if (key.includes('A220-300')) return Math.round(130 * 0.84);
  if (key.includes('A220'))    return Math.round(110 * 0.84);

  if (key.includes('EMBRAER 195') || key.includes('E195') || key.includes('E95')) return Math.round(118 * 0.84);
  if (key.includes('EMBRAER 190') || key.includes('E190') || key.includes('E90')) return Math.round(98  * 0.84);
  if (key.includes('EMBRAER 175') || key.includes('E175') || key.includes('E75')) return Math.round(76  * 0.84);
  if (key.includes('EMBRAER 170') || key.includes('E170') || key.includes('E70')) return Math.round(70  * 0.84);
  if (key.includes('EMBRAER'))     return Math.round(90 * 0.84);

  if (key.includes('CRJ-900') || key.includes('CRJ900') || key.includes('CR9')) return Math.round(90 * 0.84);
  if (key.includes('CRJ-700') || key.includes('CRJ700') || key.includes('CR7')) return Math.round(70 * 0.84);
  if (key.includes('CRJ-200') || key.includes('CRJ200') || key.includes('CR2')) return Math.round(50 * 0.84);
  if (key.includes('CANADAIR') || key.includes('BOMBARDIER') || key.includes('CRJ')) return Math.round(60 * 0.84);

  if (key.includes('787-10') || key.includes('78X')) return Math.round(330 * 0.84);
  if (key.includes('787-9')  || key.includes('789')) return Math.round(296 * 0.84);
  if (key.includes('787-8')  || key.includes('788')) return Math.round(248 * 0.84);
  if (key.includes('787'))   return Math.round(260 * 0.84);

  if (key.includes('777-300') || key.includes('77W') || key.includes('773')) return Math.round(368 * 0.84);
  if (key.includes('777-200') || key.includes('772')) return Math.round(314 * 0.84);
  if (key.includes('777'))   return Math.round(350 * 0.84);

  if (key.includes('767-400') || key.includes('764')) return Math.round(245 * 0.84);
  if (key.includes('767-300') || key.includes('76W')) return Math.round(218 * 0.84);
  if (key.includes('767'))   return Math.round(220 * 0.84);

  if (key.includes('757-300')) return Math.round(243 * 0.84);
  if (key.includes('757'))   return Math.round(200 * 0.84);
  if (key.includes('747'))   return Math.round(410 * 0.84);
  if (key.includes('A380') || key.includes('380')) return Math.round(525 * 0.84);
  if (key.includes('ATR 72') || key.includes('AT7')) return Math.round(70 * 0.84);
  if (key.includes('DASH 8') || key.includes('DH8')) return Math.round(78 * 0.84);

  const shortKey = key.replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (AC_CAP[shortKey]) return Math.round(AC_CAP[shortKey] * 0.84);
  return 130;
}

const AIRLINE_AVG_PAX = {
  WN: 143, NK: 186, F9: 186, B6: 150, G4: 155, SY: 143, AA: 145, 
  UA: 145, DL: 145, AS: 143, MQ: 76, YV: 76, OO: 76, OH: 76, CP: 76,
};

function paxWithFallback(aircraftText, capacityFromApi, airlineCode) {
  const result = pax(aircraftText, capacityFromApi);
  if (result === 130 && airlineCode && AIRLINE_AVG_PAX[airlineCode]) {
    return AIRLINE_AVG_PAX[airlineCode];
  }
  return result;
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('cancel')) return 'Cancelled';
  if (s.includes('land') || s.includes('arrived')) return 'Landed';
  if (s.includes('expected') || s.includes('arriv') || s.includes('approach')) return 'Arriving';
  if (s.includes('delay')) return 'Delayed';
  if (s.includes('depart') || s.includes('en route')) return 'En Route';
  return 'Scheduled';
}

const AIRPORT_TZ = {
  JFK:-240,LGA:-240,EWR:-240,BOS:-240,MIA:-240,FLL:-240,MCO:-240,TPA:-240,PHL:-240,DCA:-240,BWI:-240,CLT:-240,ATL:-240,DTW:-240,MSP:-240,MSY:-240,BNA:-240,RDU:-240,PIT:-240,BUF:-240,
  ORD:-300,MDW:-300,MCI:-300,STL:-300,MKE:-300,IAH:-300,HOU:-300,DFW:-300,DAL:-300,AUS:-300,SAT:-300,
  DEN:-360,SLC:-360,ABQ:-360,ELP:-360,BOI:-360,
  LAX:-420,SFO:-420,SAN:-420,SEA:-420,PDX:-420,LAS:-420,PHX:-420,
  HNL:-600,
};

function minutesFromNowLocal(localTimeStr, iataCode) {
  if (!localTimeStr) return null;
  try {
    if (/([+-]\d{2}:\d{2}|Z)$/.test(localTimeStr)) {
      return Math.round((new Date(localTimeStr).getTime() - Date.now()) / 60000);
    }
    const clean = localTimeStr.replace(/[TZ]?([+-]\d{2}:\d{2}|Z)$/, '');
    const parsedAsUTC = new Date(clean + 'Z'); 
    const airportOffsetMins = AIRPORT_TZ[iataCode] ?? -300;
    const trueFlightUTC = parsedAsUTC.getTime() - (airportOffsetMins * 60000);
    return Math.round((trueFlightUTC - Date.now()) / 60000);
  } catch {
    return null;
  }
}

function formatTime(localTimeStr) {
  if (!localTimeStr) return '—';
  try {
    const clean = localTimeStr.replace(/([+-]\d{2}:\d{2}|Z)$/, '');
    return new Date(clean).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch {
    return '—';
  }
}

// ── PROVIDERS ─────────────────────────────────────────────

async function fromAviationStack(iata) {
  const key = process.env.AVIATIONSTACK_KEY;
  if (!key) return null;
  try {
    const { data } = await axios.get('http://api.aviationstack.com/v1/flights', {
      params: { access_key: key, arr_iata: iata, flight_status: 'active,scheduled', limit: 25 },
      timeout: 8000,
    });
    if (!data?.data?.length) return null;
    return data.data.map(f => {
      const acType = f.aircraft?.iata || f.aircraft?.icao || '';
      const airlineCode = f.airline?.iata || f.flight?.iata?.slice(0,2) || '';
      const timeStr = f.arrival?.estimated || f.arrival?.scheduled || '';
      return {
        flightNumber: f.flight?.iata || '—',
        airline: f.airline?.name || '',
        origin: f.departure?.iata || '—',
        originCity: f.departure?.airport || '',
        destination: iata,
        status: normalizeStatus(f.flight_status),
        scheduledTime: formatTime(timeStr),
        minutesToArrival: minutesFromNowLocal(timeStr, iata),
        delayMinutes: Number(f.arrival?.delay || 0),
        aircraftType: acType,
        passengerCount: paxWithFallback(acType, 0, airlineCode),
        passengerLabel: 'Estimated passengers',
        terminal: f.arrival?.terminal || '',
        gate: f.arrival?.gate || '',
        isReal: true, provider: 'AviationStack',
      };
    }).filter(f => f.minutesToArrival !== null && f.minutesToArrival >= 0 && f.minutesToArrival <= 180 && f.status !== 'Cancelled');
  } catch (e) {
    console.warn('[Flight] AviationStack:', e.response?.status, e.message);
    return null;
  }
}

async function fromAeroDataBox(iata) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;
  try {
    const { data } = await axios.get(`https://aerodatabox.p.rapidapi.com/flights/airports/iata/${iata}`, {
      headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'aerodatabox.p.rapidapi.com' },
      params: { offsetMinutes: 0, durationMinutes: 180, withLeg: true, direction: 'Arrival', withCancelled: false },
      timeout: 10000,
    });
    const arrivals = data.arrivals || [];
    return arrivals.map(f => {
      const timeStr = f.arrival?.revisedTime?.local || f.arrival?.scheduledTime?.local || '';
      const mins = minutesFromNowLocal(timeStr, iata);
      const acText = [f.aircraft?.model, f.aircraft?.modelCode, f.aircraft?.icao].filter(Boolean).join(' ');
      return {
        flightNumber: f.number || f.callSign || '—',
        airline: f.airline?.name || '',
        origin: f.departure?.airport?.iata || '—',
        originCity: f.departure?.airport?.municipalityName || '',
        destination: iata,
        status: (mins !== null && mins <= 15 && mins >= 0) ? 'Arriving' : normalizeStatus(f.status),
        scheduledTime: formatTime(timeStr),
        minutesToArrival: mins,
        delayMinutes: Number(f.arrival?.delayMinutes || 0),
        aircraftType: f.aircraft?.model || '',
        passengerCount: paxWithFallback(acText, f.aircraft?.capacity || 0, f.airline?.iata || ''),
        passengerLabel: 'Estimated passengers',
        terminal: f.arrival?.terminal || '',
        gate: f.arrival?.gate || '',
        isReal: true, provider: 'AeroDataBox',
      };
    }).filter(f => f.minutesToArrival !== null && f.minutesToArrival >= 0 && f.minutesToArrival <= 180 && f.status !== 'Landed');
  } catch (e) {
    console.warn('[Flight] AeroDataBox:', e.response?.status, e.message);
    return null;
  }
}

// ── SMART ESTIMATE (FALLBACK) ─────────────────────────────
const PROFILES = { ATL:{h:110},ORD:{h:85},LAX:{h:80},DFW:{h:80},DEN:{h:65},JFK:{h:60},MDW:{h:28} };
const AIRLINES_EST = [{c:'AA',n:'American'},{c:'UA',n:'United'},{c:'DL',n:'Delta'},{c:'WN',n:'Southwest'}];
const ORIGINS_EST = [{i:'LAX',c:'Los Angeles'},{i:'JFK',c:'New York'},{i:'MIA',c:'Miami'}];
const AC_TYPES_EST = [{name:'Boeing 737-800', seats:162},{name:'Airbus A320', seats:150}];

function buildEstimate(iata) {
  const h = new Date().getHours();
  const base = PROFILES[iata]?.h || 12;
  const tmul = h>=6&&h<=9?1.4 : h>=15&&h<=19?1.5 : 0.6;
  const count = Math.min(Math.round(base * tmul * 3), 18);
  return Array.from({length: count}, (_, i) => {
    const mo = Math.round((i / Math.max(count - 1, 1)) * 170) + 10;
    const ac = AC_TYPES_EST[i % AC_TYPES_EST.length];
    return {
      flightNumber: AIRLINES_EST[i % 4].c + (1000 + i),
      airline: AIRLINES_EST[i % 4].n,
      origin: ORIGINS_EST[i % 3].i,
      destination: iata,
      status: mo <= 15 ? 'Arriving' : 'Scheduled',
      scheduledTime: formatTime(new Date(Date.now() + mo * 60000).toISOString()),
      minutesToArrival: mo,
      aircraftType: ac.name,
      passengerCount: Math.round(ac.seats * 0.84),
      isReal: false, isEstimate: true, provider: 'Smart Estimate',
    };
  });
}

// ── MAIN EXPORT ───────────────────────────────────────────

export async function fetchFlightsForAirport(iata, airportLat, airportLng) {
  if (!iata) return {
    flights: [], arrivalsPerHour: 0, passengerLoad: 0, expectedRiders: 0,
    isReal: false, delayedCount: 0, provider: 'No data', dataNote: 'No IATA code',
  };

  const cached = getCachedFlights(iata);
  if (cached) return cached;

  let flights = await fromAeroDataBox(iata);
  if (!flights || !flights.length) flights = await fromAviationStack(iata);
  if (!flights || !flights.length) flights = buildEstimate(iata);

  const isReal         = flights.some(f => f.isReal && !f.isEstimate);
  const passengerLoad  = flights.reduce((s, f) => s + Number(f.passengerCount || 0), 0);
  const expectedRiders = Math.round(passengerLoad * 0.35);
  const arrivingSoon   = flights.filter(f => (f.minutesToArrival ?? 999) <= 30);
  const delayedCount   = flights.filter(f => f.delayMinutes > 15).length;

  const result = {
    flights,
    arrivalsPerHour: flights.length,
    arrivingNext30: arrivingSoon.length,
    passengerLoad,
    expectedRiders,
    isReal,
    provider: flights[0]?.provider || 'Smart Estimate',
    dataNote: isReal
      ? `📡 Live: ${flights.length} vuelos próx. 3h · ~${passengerLoad} pasajeros · ~${expectedRiders} riders`
      : `📊 Estimado · API limit/fallback active`,
    delayedCount,
    fromCache: false,
  };

  saveFlightsCache(iata, result);
  return result;
}

// Legacy exports
export async function fetchRealArrivals(iata) {
  return (await fetchFlightsForAirport(iata)).flights;
}
export async function getArrivalsPerHour(iata) {
  return (await fetchFlightsForAirport(iata)).arrivalsPerHour;
}
