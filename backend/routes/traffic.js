import express from 'express';
import axios from 'axios';

const router = express.Router();

// Key zones with coordinates
const ZONES = [
  { name: "O'Hare Airport",   lat: 41.9742, lng: -87.9073 },
  { name: "Midway Airport",   lat: 41.7868, lng: -87.7522 },
  { name: "Downtown Chicago", lat: 41.8781, lng: -87.6298 },
  { name: "River North",      lat: 41.8940, lng: -87.6337 },
  { name: "Rosemont",         lat: 41.9953, lng: -87.8847 },
  { name: "Evanston",         lat: 42.0451, lng: -87.6877 },
  { name: "Wicker Park",      lat: 41.9088, lng: -87.6786 },
  { name: "West Loop",        lat: 41.8836, lng: -87.6470 },
];

router.get('/', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat) || 41.8781;
    const lng = parseFloat(req.query.lng) || -87.6298;
    const key = process.env.GOOGLE_MAPS_API_KEY;

    if (!key) {
      return res.json({ success: true, zones: ZONES.map(z => ({
        ...z,
        trafficScore: 50,
        driveMinutes: Math.round(Math.random() * 20 + 5),
        congestion: 'moderate',
        isMockData: true,
      }))});
    }

    const dests = ZONES.map(z => `${z.lat},${z.lng}`).join('|');
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
      { params: { origins:`${lat},${lng}`, destinations: dests, departure_time:'now', key }, timeout: 6000 }
    );

    const zones = ZONES.map((z, i) => {
      const el = data?.rows?.[0]?.elements?.[i];
      if (!el || el.status !== 'OK') return { ...z, trafficScore: 50, driveMinutes: 15, congestion: 'unknown' };
      const normal = el.duration.value;
      const withTraffic = el.duration_in_traffic?.value || normal;
      const ratio = withTraffic / normal;
      const driveMinutes = Math.round(withTraffic / 60);
      const trafficScore = Math.min(100, Math.round((ratio - 1) * 200));
      const congestion = trafficScore > 60 ? 'heavy' : trafficScore > 30 ? 'moderate' : 'light';
      return { ...z, trafficScore, driveMinutes, congestion,
        driveTime: el.duration_in_traffic?.text || el.duration.text,
        distanceMi: (el.distance.value / 1609.34).toFixed(1),
      };
    });

    res.json({ success: true, zones, source: 'google' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
