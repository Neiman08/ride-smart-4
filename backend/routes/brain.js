/**
 * Ride Smart 4.0 — Brain API Route
 * Accepts driver history, returns patterns + AI recommendation
 */
import express from 'express';
import { PatternDetector, ZoneHourMatrix } from '../services/brainEngine.js';

const router = express.Router();

// POST /api/brain — driver sends their history, gets patterns back
router.post('/analyze', (req, res) => {
  try {
    const { history = [], currentHour, liveZones = [] } = req.body;

    if (!history.length) {
      return res.json({
        success: true, message: 'No history yet — keep driving!',
        patterns: null, recommendation: null,
      });
    }

    const detector = new PatternDetector(history);
    const hour = currentHour ?? new Date().getHours();

    res.json({
      success: true,
      totalOrders:       history.length,
      patterns: {
        bestDaysOfWeek:  detector.bestDayOfWeek(),
        bestHoursOfDay:  detector.bestHourOfDay(),
        acceptRateByZone:detector.acceptRateByZone(),
        surgeImpact:     detector.surgeImpact(),
        todayVsAverage:  detector.todayVsAverage(),
      },
      recommendation: detector.recommend(hour, liveZones),
    });
  } catch(e) {
    console.error('[Brain]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/brain/heatmap — returns zone × hour matrix from history
router.post('/heatmap', (req, res) => {
  try {
    const { history = [] } = req.body;
    const matrix = new ZoneHourMatrix();
    for (const ev of history) {
      const h = new Date(ev.timestamp).getHours();
      matrix.record(ev.zone, h, ev.payout||0, ev.dollarsPerMile||0, ev.dollarsPerHour||0,
        ev.quality === 'GODLIKE' || ev.quality === 'GOOD');
    }
    res.json({ success: true, summary: matrix.getSummary(), raw: matrix.matrix });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
