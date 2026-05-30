import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import zonesRouter          from './routes/zones.js';
import airportsRouter       from './routes/airports.js';
import eventsRouter         from './routes/events.js';
import evRouter             from './routes/ev.js';
import surgeRouter          from './routes/surge.js';
import predictRouter        from './routes/predict.js';
import brainRouter          from './routes/brain.js';
import weatherRouter        from './routes/weather.js';
import trafficRouter        from './routes/traffic.js';
import fuelRouter           from './routes/fuel.js';
import recommendationRouter from './routes/recommendation.js';
import earningsPredRouter   from './routes/earningsPrediction.js';
import voiceAskRouter       from './routes/voiceAsk.js';

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// Frontend real location: rs4-final/web/public
app.use(express.static(join(__dirname, '../web/public')));

// Core data endpoints
app.use('/api/zones',               zonesRouter);
app.use('/api/airports',            airportsRouter);
app.use('/api/flights',             airportsRouter);
app.use('/api/events',              eventsRouter);
app.use('/api/brain',               brainRouter);
app.use('/api/ev',                  evRouter);
app.use('/api/surge',               surgeRouter);
app.use('/api/predict',             predictRouter);

// Phase 1-2 endpoints
app.use('/api/weather',             weatherRouter);
app.use('/api/traffic',             trafficRouter);
app.use('/api/fuel',                fuelRouter);
app.use('/api/ai/recommendation',   recommendationRouter);
app.use('/api/earnings-prediction', earningsPredRouter);
app.use('/api/voice/ask',           voiceAskRouter);

// Home route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../web/public/index.html'));
});

// Intelligence aggregator
app.get('/api/intelligence', async (req, res) => {
  try {
    const lat = req.query.lat || 41.8781;
    const lng = req.query.lng || -87.6298;
    const base = `http://localhost:${process.env.PORT || 3000}`;
    const q = `?lat=${lat}&lng=${lng}`;

    const [zones, events, surge, weather, rec] = await Promise.allSettled([
      fetch(`${base}/api/zones${q}`).then(r => r.json()),
      fetch(`${base}/api/events${q}`).then(r => r.json()),
      fetch(`${base}/api/surge`).then(r => r.json()),
      fetch(`${base}/api/weather${q}`).then(r => r.json()),
      fetch(`${base}/api/ai/recommendation${q}`).then(r => r.json()),
    ]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      zones:          zones.status   === 'fulfilled' ? zones.value   : null,
      events:         events.status  === 'fulfilled' ? events.value  : null,
      surge:          surge.status   === 'fulfilled' ? surge.value   : null,
      weather:        weather.status === 'fulfilled' ? weather.value : null,
      recommendation: rec.status     === 'fulfilled' ? rec.value     : null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '4.0',
    endpoints: [
      '/api/zones',
      '/api/airports',
      '/api/events',
      '/api/surge',
      '/api/ev',
      '/api/fuel',
      '/api/weather',
      '/api/traffic',
      '/api/predict',
      '/api/brain',
      '/api/ai/recommendation',
      '/api/earnings-prediction',
      '/api/voice/ask',
      '/api/intelligence',
    ],
    timestamp: new Date().toISOString(),
  });
});

// Google Maps key injection route
app.get('/map', (req, res) => {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY || '';
    let html = readFileSync(join(__dirname, '../web/public/heatmap.html'), 'utf8');

    html = html.replace('GOOGLE_MAPS_KEY_PLACEHOLDER', key);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    console.error('Map load error:', e.message);
    res.status(500).send('heatmap.html not found');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Ride Smart 4.0 on port ${PORT} — all endpoints active`);
});