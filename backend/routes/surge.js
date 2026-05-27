import express from 'express';
import axios from 'axios';

const router = express.Router();

// Surge patterns by hour for Chicago (historic data)
const SURGE_PATTERNS = {
  0:  { mul: 1.4, reason: 'Bar close surge' },
  1:  { mul: 1.6, reason: 'Late night surge' },
  2:  { mul: 1.8, reason: 'Peak bar close' },
  3:  { mul: 1.3, reason: 'Post-bar surge' },
  7:  { mul: 1.2, reason: 'Morning rush' },
  8:  { mul: 1.3, reason: 'Peak morning rush' },
  9:  { mul: 1.1, reason: 'Late morning rush' },
  16: { mul: 1.2, reason: 'Evening rush begins' },
  17: { mul: 1.4, reason: 'Peak evening rush' },
  18: { mul: 1.5, reason: 'Evening rush peak' },
  19: { mul: 1.3, reason: 'Evening rush tapering' },
  22: { mul: 1.2, reason: 'Late night begins' },
  23: { mul: 1.3, reason: 'Pre-bar close' },
};

// Day modifiers
const DAY_MODIFIERS = {
  0: 1.05, // Sunday
  1: 0.95, // Monday
  2: 0.95, // Tuesday
  3: 1.00, // Wednesday
  4: 1.10, // Thursday
  5: 1.30, // Friday
  6: 1.25, // Saturday
};

router.get('/', async (req, res) => {
  try {
    const now    = new Date();
    const hour   = now.getHours();
    const dow    = now.getDay();
    const minute = now.getMinutes();

    // Base multiplier from historic patterns
    const pattern = SURGE_PATTERNS[hour] || { mul: 1.0, reason: 'Normal demand' };
    const dayMod  = DAY_MODIFIERS[dow] || 1.0;
    let multiplier = pattern.mul * dayMod;

    // Weather boost (if available)
    let weatherBoost = 1.0;
    try {
      const key = process.env.OPENWEATHER_API_KEY;
      if (key) {
        const { data } = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?q=Chicago,US&appid=${key}&units=imperial`,
          { timeout: 3000 }
        );
        const rain = data?.rain?.['1h'] || 0;
        const snow = data?.snow?.['1h'] || 0;
        if (rain > 2 || snow > 1) weatherBoost = 1.3;
        else if (rain > 0.5)      weatherBoost = 1.15;
      }
    } catch { /* no weather data */ }

    multiplier *= weatherBoost;
    multiplier = Math.round(multiplier * 10) / 10;

    // Zone-specific surge adjustments
    const zoneMultipliers = {
      "O'Hare Airport":    multiplier * 1.1,
      "Midway Airport":    multiplier * 1.05,
      "Downtown Chicago":  multiplier * (hour >= 22 || hour <= 2 ? 1.3 : 1.0),
      "Rosemont":          multiplier * 1.05,
      "Evanston":          multiplier * (dow === 5 || dow === 6 ? 1.15 : 1.0),
    };

    // Upcoming surge windows (next 4 hours)
    const surgeWindows = [];
    for (let h = hour; h < hour + 4; h++) {
      const fh = h % 24;
      const p = SURGE_PATTERNS[fh];
      if (p && p.mul > 1.2) {
        surgeWindows.push({
          hour:       fh,
          multiplier: Math.round(p.mul * dayMod * 10) / 10,
          reason:     p.reason,
          label:      `${fh > 12 ? fh - 12 : fh}:00 ${fh >= 12 ? 'PM' : 'AM'}`,
        });
      }
    }

    res.json({
      success:          true,
      current:          { multiplier, reason: pattern.reason, weatherBoost },
      zoneMultipliers,
      surgeWindows,
      isSurgeActive:    multiplier >= 1.2,
      peakToday:        Math.max(...Object.values(SURGE_PATTERNS).map(p => p.mul)) * dayMod,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
