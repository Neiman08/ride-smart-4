/**
 * Ride Smart 4.0 — Flight Intelligence Service
 * Ventana: próximas 3 horas de vuelos reales
 *
 * Fix: AeroDataBox devuelve hora local sin timezone (ej: "2025-05-27T21:30:00")
 * Se compara contra la hora local del servidor, no UTC.
 */

import axios from 'axios';

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

// Airline fleet fallback — when aircraft model is unknown, use airline average
const AIRLINE_AVG_PAX = {
  WN: 143, // Southwest — 737-700/800/MAX8 fleet avg
  NK: 186, // Spirit — A320/A321 fleet
  F9: 186, // Frontier — A320/A321 fleet
  B6: 150, // JetBlue — A320/A321 fleet
  G4: 155, // Allegiant — A319/A320 fleet
  SY: 143, // Sun Country — 737 fleet
  AA: 145, // American — mixed fleet avg
  UA: 145, // United — mixed fleet avg
  DL: 145, // Delta — mixed fleet avg
  AS: 143, // Alaska — 737 fleet
  MQ: 76,  // Envoy (AA regional) — E175 fleet
  YV: 76,  // Mesa — E175 fleet
  OO: 76,  // SkyWest — E175/CRJ fleet
  OH: 76,  // PSA — CRJ fleet
  CP: 76,  // Compass — E175 fleet
};

function paxWithFallback(aircraftText, capacityFromApi, airlineCode) {
  const result = pax(aircraftText, capacityFromApi);
  // If we got the default 130 AND we know the airline, use airline average
  if (result === 130 && airlineCode && AIRLINE_AVG_PAX[airlineCode]) {
    return AIRLINE_AVG_PAX[airlineCode];
  }
  return result;
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('cancel'))                                                 return 'Cancelled';
  if (s.includes('land') || s.includes('arrived'))                         return 'Landed';
  if (s.includes('expected') || s.includes('arriv') || s.includes('approach')) return 'Arriving';
  if (s.includes('delay'))                                                  return 'Delayed';
  if (s.includes('depart') || s.includes('en route'))                      return 'En Route';
  return 'Scheduled';
}

// Airport IATA → UTC offset in minutes (standard time + DST where applicable)
// Updated for CDT/EDT/MDT/PDT summer offsets (Mar-Nov)
const AIRPORT_UTC_OFFSET = {
  // UTC-4 EDT (Eastern Daylight)
  JFK:-240,LGA:-240,EWR:-240,BOS:-240,MIA:-240,FLL:-240,MCO:-240,
  TPA:-240,PHL:-240,DCA:-240,BWI:-240,CLT:-240,ATL:-240,DTW:-240,
  MSP:-240,MSY:-240,BNA:-240,RDU:-240,PIT:-240,BUF:-240,
  // UTC-5 CDT (Central Daylight) — Chicago area
  ORD:-300,MDW:-300,MCI:-300,STL:-300,MSN:-300,MKE:-300,
  IAH:-300,HOU:-300,DFW:-300,DAL:-300,AUS:-300,SAT:-300,
  // UTC-6 MDT (Mountain Daylight)
  DEN:-360,SLC:-360,ABQ:-360,ELP:-360,BOI:-360,
  // UTC-7 PDT (Pacific Daylight)
  LAX:-420,SFO:-420,SAN:-420,SEA:-420,PDX:-420,LAS:-420,PHX:-420,
  // UTC-10 HST (Hawaii — no DST)
  HNL:-600,
};

/**
 * KEY FIX: AeroDataBox returns LOCAL airport time without timezone offset
 * e.g. "2025-05-27T22:20:00" = 10:20pm Chicago time (CDT = UTC-5)
 *
 * Server runs UTC. We know the airport's local offset, so we can
 * convert airport local time → UTC → compare with now (UTC).
 */
function minutesFromNowLocal(localTimeStr, iataCode) {
  if (!localTimeStr) return null;
  try {
    // If string already has explicit UTC offset (+HH:MM or Z), parse directly
    if (/([+-]\d{2}:\d{2}|Z)$/.test(localTimeStr)) {
      return Math.round((new Date(localTimeStr).getTime() - Date.now()) / 60000);
    }

    // No offset — treat as airport local time
    // Get airport UTC offset (default to CDT -300 for US airports)
    const offsetMins = AIRPORT_UTC_OFFSET[iataCode] ?? -300;

    // Parse the local time string as-is (JS treats no-offset as local server time)
    // We correct for the difference between server UTC offset and airport UTC offset
    const serverOffsetMins = -new Date().getTimezoneOffset(); // server's UTC offset in min
    const correctionMins   = offsetMins - serverOffsetMins;   // how much to shift

    // Strip any trailing offset just in case, parse raw
    const clean = localTimeStr.replace(/([+-]\d{2}:\d{2}|Z)$/, '');
    const parsed = new Date(clean); // parsed as server local time
    // Apply correction to get true UTC equivalent
    const trueUTC = parsed.getTime() - (correctionMins * 60000);
    return Math.round((trueUTC - Date.now()) / 60000);
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

// ── PROVIDER 1: AviationStack ─────────────────────────────
async function fromAviationStack(iata) {
  const key = process.env.AVIATIONSTACK_KEY;
  if (!key) return null;
  try {
    const { data } = await axios.get('http://api.aviationstack.com/v1/flights', {
      params: {
        access_key:    key,
        arr_iata:      iata,
        flight_status: 'active,scheduled',
        limit:         25,
      },
      timeout: 8000,
    });
    if (!data?.data?.length) return null;

    return data.data.map(f => {
      const acType      = f.aircraft?.iata || f.aircraft?.icao || '';
      const airlineCode = f.airline?.iata || f.flight?.iata?.slice(0,2) || '';
      const timeStr     = f.arrival?.estimated || f.arrival?.scheduled || '';
      const mins        = minutesFromNowLocal(timeStr, iata);
      return {
        flightNumber:    f.flight?.iata || '—',
        airline:         f.airline?.name || '',
        origin:          f.departure?.iata || '—',
        originCity:      f.departure?.airport || '',
        destination:     iata,
        status:          normalizeStatus(f.flight_status),
        scheduledTime:   formatTime(timeStr),
        minutesToArrival:mins,
        delayMinutes:    Number(f.arrival?.delay || 0),
        aircraftType:    acType,
        passengerCount:  paxWithFallback(acType, 0, airlineCode),
        passengerLabel:  'Estimated passengers',
        terminal:        f.arrival?.terminal || '',
        gate:            f.arrival?.gate || '',
        baggageBelt:     '',
        isReal:          true,
        isEstimate:      false,
        provider:        'AviationStack',
      };
    })
    .filter(f =>
      f.minutesToArrival !== null &&
      f.minutesToArrival >= 0 &&
      f.minutesToArrival <= 180 &&
      f.status !== 'Cancelled'
      && f.origin !== '—' &&
      f.originCity !== 'Unknown'
    )
    .sort((a, b) => a.minutesToArrival - b.minutesToArrival)
    .slice(0, 20);
  } catch (e) {
    console.warn('[Flight] AviationStack:', e.message);
    return null;
  }
}

// ── PROVIDER 2: AeroDataBox via RapidAPI ──────────────────
async function fromAeroDataBox(iata) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;
  try {
    const { data } = await axios.get(
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${iata}`,
      {
        headers: {
          'x-rapidapi-key':  key,
          'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
        },
        params: {
          offsetMinutes:   0,     // desde ahora
          durationMinutes: 180,   // próximas 3 horas
          withLeg:         true,
          direction:       'Arrival',
          withCancelled:   false,
          withCodeshared:  false,
          withCargo:       false,
          withPrivate:     false,
          withLocation:    false,
        },
        timeout: 10000,
      }
    );

    const arrivals = data.arrivals || [];
    if (!arrivals.length) return null;

    return arrivals.map(f => {
      const timeStr =
        f.arrival?.revisedTime?.local ||
        f.arrival?.scheduledTime?.local || '';

      const mins = minutesFromNowLocal(timeStr, iata);

      // Use full model name first — gives best pax lookup
      // "Boeing 737-800" >> "738" >> "B738"
      const aircraftText = [
        f.aircraft?.model,
        f.aircraft?.modelCode,
        f.aircraft?.icao,
      ].filter(Boolean).join(' ');

      return {
        flightNumber:    f.number || f.callSign || '—',
        airline:         f.airline?.name || '',
        origin:          f.departure?.airport?.iata || '—',
        originCity:      f.departure?.airport?.municipalityName ||
                         f.departure?.airport?.name || '',
        destination:     iata,
        status:          mins !== null && mins <= 15 && mins >= 0
                           ? 'Arriving' : normalizeStatus(f.status),
        scheduledTime:   formatTime(timeStr),
        minutesToArrival:mins,
        delayMinutes:    Number(f.arrival?.delayMinutes || f.delayMinutes || 0),
        aircraftType:    f.aircraft?.model || aircraftText || '',
        passengerCount:  paxWithFallback(aircraftText, f.aircraft?.capacity || 0, f.airline?.iata || ''),
        passengerLabel:  'Estimated passengers',
        terminal:        f.arrival?.terminal || '',
        gate:            f.arrival?.gate || '',
        baggageBelt:     f.arrival?.baggageBelt || '',
        isReal:          true,
        isEstimate:      false,
        provider:        'AeroDataBox',
      };
    })
    .filter(f =>
      f.minutesToArrival !== null &&
      f.minutesToArrival >= 0 &&        // solo futuros
      f.minutesToArrival <= 180 &&      // máximo 3 horas
      f.status !== 'Cancelled' &&
      f.status !== 'Landed'             // excluir ya aterrizados
    )
    .sort((a, b) => a.minutesToArrival - b.minutesToArrival)
    .slice(0, 20);
  } catch (e) {
    console.warn('[Flight] AeroDataBox:', e.response?.status, e.message);
    return null;
  }
}

// ── PROVIDER 3: Smart Estimate (sin API key) ──────────────
const PROFILES = {
  ATL:{h:110},ORD:{h:85},LAX:{h:80},DFW:{h:80},DEN:{h:65},JFK:{h:60},
  SFO:{h:55},SEA:{h:50},LAS:{h:50},MCO:{h:45},MIA:{h:45},PHX:{h:45},
  EWR:{h:42},BOS:{h:40},MSP:{h:38},DTW:{h:38},CLT:{h:42},IAH:{h:42},
  MDW:{h:28},LGA:{h:35},BWI:{h:30},DCA:{h:30},SAN:{h:25},TPA:{h:22},
  STL:{h:18},MCI:{h:15},MSY:{h:18},RDU:{h:16},AUS:{h:18},PDX:{h:18},
  SLC:{h:22},FLL:{h:28},BNA:{h:16},HNL:{h:20},
};
const AIRLINES_EST = [
  {c:'AA',n:'American'},{c:'UA',n:'United'},{c:'DL',n:'Delta'},
  {c:'WN',n:'Southwest'},{c:'B6',n:'JetBlue'},{c:'AS',n:'Alaska'},
  {c:'NK',n:'Spirit'},{c:'F9',n:'Frontier'},
];
const ORIGINS_EST = [
  {i:'LAX',c:'Los Angeles'},{i:'JFK',c:'New York'},{i:'MIA',c:'Miami'},
  {i:'DFW',c:'Dallas'},{i:'ATL',c:'Atlanta'},{i:'BOS',c:'Boston'},
  {i:'SFO',c:'San Francisco'},{i:'PHX',c:'Phoenix'},{i:'DEN',c:'Denver'},
  {i:'SEA',c:'Seattle'},{i:'LAS',c:'Las Vegas'},{i:'MCO',c:'Orlando'},
  {i:'CLT',c:'Charlotte'},{i:'EWR',c:'Newark'},{i:'LGA',c:'New York'},
];
const AC_TYPES_EST = [
  {name:'Boeing 737-800',   seats:162},
  {name:'Airbus A320',      seats:150},
  {name:'Airbus A321',      seats:185},
  {name:'Airbus A319',      seats:128},
  {name:'Boeing 737 MAX 8', seats:178},
  {name:'Embraer 175',      seats:76},
  {name:'CRJ-900',          seats:90},
  {name:'Boeing 787-9',     seats:296},
  {name:'Boeing 737-700',   seats:143},
];

function buildEstimate(iata) {
  const h   = new Date().getHours();
  const dow = new Date().getDay();
  const base = PROFILES[iata]?.h || 12;
  const tmul = h>=6&&h<=9?1.4 : h>=10&&h<=14?1.0 : h>=15&&h<=19?1.5 : h>=20&&h<=22?0.8 : 0.3;
  const wmul = [0,5,6].includes(dow) ? 1.12 : 1.0;
  const count = Math.min(Math.round(base * tmul * wmul * 3), 18);

  return Array.from({length: count}, (_, i) => {
    const al  = AIRLINES_EST[i % AIRLINES_EST.length];
    const org = ORIGINS_EST[i % ORIGINS_EST.length];
    const ac  = AC_TYPES_EST[i % AC_TYPES_EST.length];
    const mo  = Math.round((i / Math.max(count - 1, 1)) * 170) + 10; // 10-180 min
    const t   = new Date(Date.now() + mo * 60000);
    return {
      flightNumber:    al.c + (1000 + (i * 137 + (iata.charCodeAt(0)||0)) % 8999),
      airline:         al.n,
      origin:          org.i,
      originCity:      org.c,
      destination:     iata,
      status:          mo <= 15 ? 'Arriving' : 'Scheduled',
      scheduledTime:   t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}),
      minutesToArrival:mo,
      delayMinutes:    Math.random() < 0.15 ? Math.round(Math.random() * 45) : 0,
      aircraftType:    ac.name,
      passengerCount:  Math.round(ac.seats * 0.84),
      passengerLabel:  'Estimated passengers',
      terminal:        ['A','B','C','D','E'][i % 5] + Math.ceil((i + 1) / 2),
      gate:            '',
      baggageBelt:     '',
      isReal:          false,
      isEstimate:      true,
      provider:        'Smart Estimate',
    };
  });
}

// ── MAIN EXPORT ───────────────────────────────────────────
export async function fetchFlightsForAirport(iata, airportLat, airportLng) {
  if (!iata) return {
    flights:[], arrivalsPerHour:0, passengerLoad:0,
    expectedRiders:0, isReal:false, delayedCount:0,
    provider:'No data', dataNote:'No IATA code',
  };

  // Try real providers first, fall back to estimate
  let flights = await fromAeroDataBox(iata);
  if (!flights || !flights.length) flights = await fromAviationStack(iata);
  if (!flights || !flights.length) flights = [];

  const isReal         = flights.some(f => f.isReal && !f.isEstimate);
  const passengerLoad  = flights.reduce((s, f) => s + Number(f.passengerCount || 0), 0);
  const expectedRiders = Math.round(passengerLoad * 0.35);
  const arrivingSoon   = flights.filter(f => (f.minutesToArrival ?? 999) <= 30);
  const delayedCount   = flights.filter(f => f.delayMinutes > 15).length;

  return {
  flights,
  arrivalsPerHour:  flights.length,
  arrivingNext30:   arrivingSoon.length,
  passengerLoad,
  expectedRiders,
  isReal,
  provider:   flights[0]?.provider || 'No data',
    dataNote:   isReal
      ? `📡 Live: ${flights.length} vuelos próx. 3h · ~${passengerLoad} pasajeros · ~${expectedRiders} riders`
      : `Sin vuelos reales en la ventana seleccionada`,
    delayedCount,
  };
}

// Legacy exports
export async function fetchRealArrivals(iata) {
  return (await fetchFlightsForAirport(iata)).flights;
}
export async function getArrivalsPerHour(iata) {
  return (await fetchFlightsForAirport(iata)).arrivalsPerHour;
}
