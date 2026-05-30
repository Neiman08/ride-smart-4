/**
 * /api/voice/ask
 * Backend proxy for Voice AI — keeps API key server-side
 */
import express from 'express';
import axios from 'axios';

const router = express.Router();

router.post('/', async (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ success: false, error: 'No question' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: smart local answer
    return res.json({ success: true, answer: localAnswer(question, context), source: 'local' });
  }

  try {
    const system = `You are Ride Smart, an AI co-pilot for rideshare drivers.
You have real-time data:
- City: ${context?.city || 'Chicago'}
- Top zone: ${context?.topZone} (score: ${context?.zoneScore}, est $${context?.estimatedHourly}/hr)
- Flight riders expected: ~${context?.expectedFlightRiders || 0}
- Event riders expected: ~${context?.expectedEventRiders || 0}
- Events tonight: ${context?.eventsTotal || 0} (surge: ${context?.eventsSurge || false})
- Surge: ${context?.surgeMultiplier || 1}x (active: ${context?.surgeActive || false})
- Weather: ${context?.weather || 'Clear'}
- Best zones: ${JSON.stringify(context?.allZones || [])}
- Key insights: ${(context?.insights || []).join(', ')}

Give CONCISE (2-3 sentences max), actionable, data-driven advice. No markdown. Speak like a sharp co-pilot.`;

    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: question }],
    }, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 12000,
    });

    const answer = data.content?.[0]?.text || localAnswer(question, context);
    res.json({ success: true, answer, source: 'claude' });
  } catch(e) {
    res.json({ success: true, answer: localAnswer(question, context), source: 'local' });
  }
});

function localAnswer(q, ctx) {
  const ql = (q || '').toLowerCase();
  const c = ctx || {};
  if (!c.topZone) return "I don't have live data right now. Make sure the backend is running.";
  if (ql.includes('where') || ql.includes('go') || ql.includes('best zone'))
    return `Head to ${c.topZone} — score ${c.zoneScore}, est $${c.estimatedHourly}/hr. ${c.insights?.[0] || 'Strong signals there.'}`;
  if (ql.includes('airport') || ql.includes('flight'))
    return `About ${c.expectedFlightRiders || 0} riders expected from flights. ${c.zoneScore > 65 ? 'Airport is busy.' : 'Moderate traffic.'}`;
  if (ql.includes('event') || ql.includes('concert'))
    return `${c.eventsTotal || 0} events tonight. ${c.eventsSurge ? 'Surge active near venues.' : 'No surge yet.'}`;
  if (ql.includes('surge'))
    return `Current surge: ${c.surgeMultiplier || 1}x. ${c.surgeActive ? 'Surge IS active — good time!' : 'Normal demand.'}`;
  if (ql.includes('weather'))
    return `Weather: ${c.weather}. ${(c.weather||'').toLowerCase().includes('rain') ? 'Rain boosts demand 20-30%.' : 'Good driving conditions.'}`;
  return `Best move: head to ${c.topZone}. Score ${c.zoneScore}, ~$${c.estimatedHourly}/hr. ${c.insights?.[0] || ''}`;
}

export default router;
