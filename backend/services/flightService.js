/**
 * Ride Smart 4.0 — Flight Intelligence Service
 * Fix:
 * - ORD solo muestra vuelos llegando a ORD
 * - MDW solo muestra vuelos llegando a MDW
 * - Passenger count NO es real: es capacidad estimada
 */

import axios from 'axios';

const AC_CAP = {
  '737':155,'73H':155,'73G':136,'738':162,'739':178,'73W':143,
  '319':120,'320':150,'321':185,'32A':150,'32N':165,'32Q':194,
  'E75':76,'E7W':76,'E70':70,'E90':98,'E95':110,
  'CR9':90,'CRJ':50,'CR7':70,
  '767':250,'76W':218,'777':350,'77W':350,'772':305,
  '787':242,'788':242,'789':290,'78X':320,
  '380':525,'747':410,'74H':412,
  'DH8':78,'AT7':72,'AT5':50,
};

function estimatedPax(ac, cap){
  if(cap > 0) return Math.round(cap * 0.84);
  return Math.round((AC_CAP[String(ac || '').toUpperCase()] || 155) * 0.84);
}

function normalizeStatus(raw){
  if(!raw) return 'Scheduled';
  const s = String(raw).toLowerCase();
  if(s.includes('land') || s.includes('arrived')) return 'Landed';
  if(s.includes('arriv') || s.includes('approach')) return 'Arriving';
  if(s.includes('cancel')) return 'Cancelled';
  if(s.includes('delay')) return 'Delayed';
  if(s.includes('depart') || s.includes('en route') || s.includes('active')) return 'En Route';
  return 'Scheduled';
}

function cleanIata(v){
  return String(v || '').trim().toUpperCase();
}

// ── AviationStack ──────────────────────────────
async function fromAviationStack(iata){
  const key = process.env.AVIATIONSTACK_KEY;
  if(!key) return null;

  const target = cleanIata(iata);

  try{
    const { data } = await axios.get('http://api.aviationstack.com/v1/flights', {
      params:{
        access_key:key,
        arr_iata:target,
        limit:100
      },
      timeout:8000
    });

    const rows = data?.data || [];

    const filtered = rows.filter(f => {
      const arrIata = cleanIata(f.arrival?.iata);
      const arrAirport = String(f.arrival?.airport || '').toLowerCase();

      if(arrIata === target) return true;

      if(target === 'ORD' && arrAirport.includes("o'hare")) return true;
      if(target === 'MDW' && arrAirport.includes('midway')) return true;

      return false;
    });

    if(!filtered.length) return null;

    return filtered.slice(0,20).map(f => {
      const ac = f.aircraft?.iata || '';

      return {
        flightNumber: f.flight?.iata || f.flight?.icao || '—',
        airline: f.airline?.name || '',
        origin: cleanIata(f.departure?.iata) || '—',
        originCity: f.departure?.airport || '',
        destination: cleanIata(f.arrival?.iata) || target,
        destinationAirport: f.arrival?.airport || '',
        status: normalizeStatus(f.flight_status),
        scheduledTime: f.arrival?.scheduled?.slice(11,16) || '—',
        delayMinutes: Number(f.arrival?.delay || 0),
        aircraftType: ac,
        passengerCount: estimatedPax(ac, 0),
        passengerLabel: 'Estimated capacity',
        terminal: f.arrival?.terminal || '',
        isReal: true,
        isEstimate: false,
        provider: 'AviationStack'
      };
    });

  }catch(e){
    console.warn('[Flight] AviationStack:', e.message);
    return null;
  }
}

// ── AeroDataBox ──────────────────────────────
async function fromAeroDataBox(iata){
  const key = process.env.RAPIDAPI_KEY;
  if(!key) return null;

  const target = cleanIata(iata);

  try{
    const { data } = await axios.get(
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${target}/arrivals`,
      {
        headers:{
          'x-rapidapi-key':key,
          'x-rapidapi-host':'aerodatabox.p.rapidapi.com'
        },
        params:{
          offsetMinutes:-90,
          durationMinutes:240,
          withLeg:true,
          withCancelled:false
        },
        timeout:8000
      }
    );

    const arrivals = data?.arrivals || [];
    if(!arrivals.length) return null;

    return arrivals.slice(0,20).map(f => {
      const ac = f.aircraft?.model || '';

      return {
        flightNumber: f.number || '—',
        airline: f.airline?.name || '',
        origin: cleanIata(f.departure?.airport?.iata) || '—',
        originCity: f.departure?.airport?.municipalityName || f.departure?.airport?.name || '',
        destination: target,
        destinationAirport: f.arrival?.airport?.name || '',
        status: normalizeStatus(f.status),
        scheduledTime: f.scheduledTimeLocal?.split('T')[1]?.slice(0,5) || '—',
        delayMinutes: 0,
        aircraftType: ac,
        passengerCount: estimatedPax(ac, 0),
        passengerLabel: 'Estimated capacity',
        terminal: f.arrival?.terminal || '',
        isReal: true,
        isEstimate: false,
        provider:'AeroDataBox'
      };
    });

  }catch(e){
    console.warn('[Flight] AeroDataBox:', e.message);
    return null;
  }
}

// ── OpenSky ──────────────────────────────
async function fromOpenSky(iata, lat, lng){
  if(!lat || !lng) return null;

  try{
    const d = 0.6;

    const { data } = await axios.get('https://opensky-network.org/api/states/all', {
      params:{
        lamin:lat - d,
        lamax:lat + d,
        lomin:lng - d,
        lomax:lng + d
      },
      timeout:8000
    });

    const approaching = (data?.states || [])
      .filter(s => s[7] !== null && s[7] < 7000)
      .slice(0,8);

    if(!approaching.length) return null;

    return approaching.map((s,i) => ({
      flightNumber: s[1]?.trim() || `ADSB-${i+1}`,
      airline: '',
      origin:'—',
      originCity:'Live aircraft near airport',
      destination: cleanIata(iata),
      status:'Arriving',
      scheduledTime: new Date(Date.now() + (8 + i * 6) * 60000)
        .toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}),
      delayMinutes:0,
      aircraftType:'',
      passengerCount:130,
      passengerLabel:'Estimated capacity',
      altitude:Math.round(s[7] || 0),
      terminal:'',
      isReal:true,
      isEstimate:true,
      provider:'OpenSky ADSB'
    }));

  }catch(e){
    console.warn('[Flight] OpenSky:', e.message);
    return null;
  }
}

// ── Smart Estimate ──────────────────────────────
const PROFILES = {
  ATL:{h:110},ORD:{h:85},LAX:{h:80},DFW:{h:80},DEN:{h:65},JFK:{h:60},
  SFO:{h:55},SEA:{h:50},LAS:{h:50},MCO:{h:45},MIA:{h:45},PHX:{h:45},
  EWR:{h:42},BOS:{h:40},MSP:{h:38},DTW:{h:38},CLT:{h:42},IAH:{h:42},
  MDW:{h:28},LGA:{h:35},BWI:{h:30},DCA:{h:30},SAN:{h:25},TPA:{h:22},
  STL:{h:18},MCI:{h:15},MSY:{h:18},RDU:{h:16},AUS:{h:18},PDX:{h:18},
  SLC:{h:22},FLL:{h:28},BNA:{h:16},HNL:{h:20}
};

const AIRLINES = [
  {c:'AA',n:'American'},
  {c:'UA',n:'United'},
  {c:'DL',n:'Delta'},
  {c:'WN',n:'Southwest'},
  {c:'B6',n:'JetBlue'},
  {c:'AS',n:'Alaska'},
  {c:'NK',n:'Spirit'},
  {c:'F9',n:'Frontier'}
];

const ORIGINS = [
  {i:'LAX',c:'Los Angeles'},
  {i:'JFK',c:'New York'},
  {i:'MIA',c:'Miami'},
  {i:'DFW',c:'Dallas'},
  {i:'ATL',c:'Atlanta'},
  {i:'LGA',c:'New York'},
  {i:'BOS',c:'Boston'},
  {i:'SFO',c:'San Francisco'},
  {i:'PHX',c:'Phoenix'},
  {i:'DEN',c:'Denver'},
  {i:'SEA',c:'Seattle'},
  {i:'LAS',c:'Las Vegas'},
  {i:'MCO',c:'Orlando'},
  {i:'CLT',c:'Charlotte'},
  {i:'EWR',c:'Newark'}
];

const AC = ['738','320','321','319','73W','E75','CR9','737','32A','789'];

function buildEstimate(iata){
  const target = cleanIata(iata);
  const h = new Date().getHours();
  const dow = new Date().getDay();

  const base = PROFILES[target]?.h || 12;

  const tmul =
    h >= 6 && h <= 9 ? 1.4 :
    h >= 10 && h <= 14 ? 1.0 :
    h >= 15 && h <= 19 ? 1.5 :
    h >= 20 && h <= 22 ? 0.8 :
    0.3;

  const wmul = [0,5,6].includes(dow) ? 1.12 : 1.0;
  const count = Math.min(Math.round(base * tmul * wmul), 18);

  const flights = [];

  for(let i = 0; i < count; i++){
    const al = AIRLINES[i % AIRLINES.length];
    const or = ORIGINS[i % ORIGINS.length];
    const ac = AC[i % AC.length];

    const minutesOffset = -50 + (i * (100 / Math.max(count,1)));
    const t = new Date(Date.now() + minutesOffset * 60000);

    const st =
      minutesOffset < -5 ? 'Landed' :
      minutesOffset < 15 ? 'Arriving' :
      'Scheduled';

    const dl = Math.random() < 0.15 ? Math.round(Math.random() * 45) : 0;

    flights.push({
      flightNumber: al.c + (1000 + (i * 137 + target.charCodeAt(0)) % 8999),
      airline: al.n,
      origin: or.i,
      originCity: or.c,
      destination: target,
      status: st,
      scheduledTime: `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`,
      delayMinutes: dl,
      aircraftType: ac,
      passengerCount: estimatedPax(ac,0),
      passengerLabel:'Estimated capacity',
      terminal:['A','B','C','D','E'][i % 5] + Math.ceil((i + 1) / 2),
      isReal:false,
      isEstimate:true,
      provider:'Smart Estimate'
    });
  }

  return flights;
}

// ── MAIN EXPORT ──────────────────────────────
export async function fetchFlightsForAirport(iata, airportLat, airportLng){
  const target = cleanIata(iata);

  if(!target){
    return {
      flights:[],
      arrivalsPerHour:0,
      passengerLoad:0,
      expectedRiders:0,
      isReal:false
    };
  }

  let flights = await fromAviationStack(target);

  if(!flights || !flights.length){
    flights = await fromAeroDataBox(target);
  }

  if(!flights || !flights.length){
    flights = await fromOpenSky(target, airportLat, airportLng);
  }

  if(!flights || !flights.length){
    flights = buildEstimate(target);
  }

  flights = flights.filter(f => {
    if(!f) return false;
    if(f.destination && cleanIata(f.destination) !== target) return false;
    return true;
  });

  const isReal = flights.some(f => f.isReal && !f.isEstimate);

  const arriving = flights.filter(f =>
    ['Arriving','Landed','En Route','Scheduled'].includes(f.status)
  );

  const passengerLoad = arriving.reduce(
    (sum,f) => sum + Number(f.passengerCount || 0),
    0
  );

  const expectedRiders = Math.round(passengerLoad * 0.35);

  return {
    flights: flights.slice(0,20),
    arrivalsPerHour: arriving.length,
    passengerLoad,
    expectedRiders,
    isReal,
    provider: flights[0]?.provider || 'Smart Estimate',
    dataNote: isReal
      ? '📡 Live airport arrival data'
      : '📊 Estimated flight pattern',
    delayedCount: flights.filter(f => Number(f.delayMinutes || 0) > 15).length
  };
}

export async function fetchRealArrivals(iata){
  return (await fetchFlightsForAirport(iata)).flights;
}

export async function getArrivalsPerHour(iata){
  return (await fetchFlightsForAirport(iata)).arrivalsPerHour;
}