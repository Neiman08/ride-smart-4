import express from 'express';
import { predictHourly } from '../services/intelligenceEngine.js';

const router = express.Router();

// Historical hourly data by zone (Chicago averages)
const ZONE_HISTORIC = {
  "O'Hare Airport":    { base: 38, peakMorning: 45, peakEvening: 48, weekend: 42 },
  "Midway Airport":    { base: 34, peakMorning: 40, peakEvening: 42, weekend: 36 },
  "Downtown Chicago":  { base: 28, peakMorning: 32, peakEvening: 36, weekend: 34 },
  "Rosemont":          { base: 32, peakMorning: 36, peakEvening: 38, weekend: 35 },
  "Evanston":          { base: 26, peakMorning: 28, peakEvening: 30, weekend: 32 },
  "Schaumburg":        { base: 28, peakMorning: 30, peakEvening: 32, weekend: 29 },
  "Naperville":        { base: 26, peakMorning: 28, peakEvening: 30, weekend: 28 },
  "Arlington Heights": { base: 27, peakMorning: 29, peakEvening: 31, weekend: 28 },
};

function getHistoric(zone, hour, dow) {
  const h = ZONE_HISTORIC[zone] || { base: 25, peakMorning: 28, peakEvening: 30, weekend: 27 };
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) return h.weekend;
  if (hour >= 7 && hour <= 9)   return h.peakMorning;
  if (hour >= 16 && hour <= 19) return h.peakEvening;
  return h.base;
}

function buildHeatmapHours(zone, dow) {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const historic = getHistoric(zone, h, dow);
    hours.push({
      hour:    h,
      label:   h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`,
      hourly:  historic,
      score:   Math.min(100, Math.round((historic / 50) * 100)),
    });
  }
  return hours;
}

router.get('/', async (req, res) => {
  try {
    const now  = new Date();
    const hour = now.getHours();
    const dow  = now.getDay();

    const zones = Object.keys(ZONE_HISTORIC);
    const predictions = zones.map(zone => {
      const historicNow  = getHistoric(zone, hour, dow);
      const historic30   = getHistoric(zone, (hour + 1) % 24, dow);
      const historic60   = getHistoric(zone, (hour + 2) % 24, dow);

      // Trend
      const trend = historic30 > historicNow ? 'UP' : historic30 < historicNow ? 'DOWN' : 'FLAT';

      return {
        zone,
        now:       historicNow,
        in30min:   historic30,
        in60min:   historic60,
        trend,
        trendPct:  Math.round(((historic30 - historicNow) / historicNow) * 100),
        heatmap:   buildHeatmapHours(zone, dow),
        bestHour:  buildHeatmapHours(zone, dow).reduce((a, b) => a.hourly > b.hourly ? a : b),
      };
    });

    // Sort by predicted 30min value
    predictions.sort((a, b) => b.in30min - a.in30min);

    res.json({
      success:     true,
      generatedAt: now.toISOString(),
      currentHour: hour,
      dayOfWeek:   dow,
      predictions,
      topZone30:   predictions[0]?.zone,
      topZone60:   [...predictions].sort((a,b) => b.in60min - a.in60min)[0]?.zone,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
