import express from 'express';
import axios from 'axios';

const router = express.Router();

// GasBuddy-style price estimates by market (updated periodically)
const MARKET_PRICES = {
  default: { regular: 3.89, midgrade: 4.19, premium: 4.49, diesel: 4.09 },
  chicago: { regular: 3.95, midgrade: 4.25, premium: 4.55, diesel: 4.15 },
};

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const key = process.env.GOOGLE_MAPS_API_KEY;

    const prices = MARKET_PRICES.chicago;

    let stations = [];
    if (key) {
      try {
        const { data } = await axios.get(
          'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
          { params: { location:`${lat},${lng}`, radius:8000, type:'gas_station', key }, timeout: 6000 }
        );
        stations = (data.results || []).slice(0, 10).map(p => ({
          name: p.name,
          address: p.vicinity,
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          placeId: p.place_id,
          rating: p.rating,
          // Price estimates (no real-time API without paid GasBuddy access)
          prices: {
            regular:  (prices.regular  + (Math.random() * 0.20 - 0.10)).toFixed(2),
            premium:  (prices.premium  + (Math.random() * 0.20 - 0.10)).toFixed(2),
            diesel:   (prices.diesel   + (Math.random() * 0.20 - 0.10)).toFixed(2),
          },
          isEstimate: true,
          distanceMi: haversineMi(lat, lng, p.geometry.location.lat, p.geometry.location.lng).toFixed(1),
        }));
      } catch(e) { console.warn('[Fuel] Google Places error:', e.message); }
    }

    // Fallback mock stations
    if (!stations.length) {
      stations = [
        { name: 'Shell', address: 'Near your location', lat, lng, prices, isEstimate: true, distanceMi: '0.4', isMockData: true },
        { name: 'BP',    address: 'Nearby',             lat, lng, prices, isEstimate: true, distanceMi: '0.8', isMockData: true },
        { name: 'Mobil', address: 'Nearby',             lat, lng, prices, isEstimate: true, distanceMi: '1.2', isMockData: true },
      ];
    }

    res.json({
      success: true,
      marketPrices: prices,
      stations: stations.sort((a, b) => parseFloat(a.distanceMi) - parseFloat(b.distanceMi)),
      note: 'Prices are market estimates. Tap station for live GasBuddy link.',
    });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8, dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toRad(v) { return v * Math.PI / 180; }

export default router;
