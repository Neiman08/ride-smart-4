import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import zonesRouter    from './routes/zones.js';
import airportsRouter from './routes/airports.js';
import eventsRouter   from './routes/events.js';
import evRouter       from './routes/ev.js';
import surgeRouter    from './routes/surge.js';
import predictRouter  from './routes/predict.js';
import brainRouter    from './routes/brain.js';

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Servir frontend desde /web/public
app.use(express.static(path.join(__dirname, '../web/public')));

app.use('/api/zones',    zonesRouter);
app.use('/api/airports', airportsRouter);
app.use('/api/flights',  airportsRouter);
app.use('/api/events',   eventsRouter);
app.use('/api/brain',    brainRouter);
app.use('/api/ev',       evRouter);
app.use('/api/surge',    surgeRouter);
app.use('/api/predict',  predictRouter);

// Intelligence aggregator — all signals in one call
app.get('/api/intelligence', async (req, res) => {
  try {
    const PORT = process.env.PORT || 3000;

    const [zones, events, surge] = await Promise.allSettled([
      fetch(`http://localhost:${PORT}/api/zones`).then(r => r.json()),
      fetch(`http://localhost:${PORT}/api/events`).then(r => r.json()),
      fetch(`http://localhost:${PORT}/api/surge`).then(r => r.json()),
    ]);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      zones:  zones.status  === 'fulfilled' ? zones.value  : null,
      events: events.status === 'fulfilled' ? events.value : null,
      surge:  surge.status  === 'fulfilled' ? surge.value  : null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Abrir index.html por defecto
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Ride Smart 4.0 on port ${PORT}`));