import express from 'express';
import './env.js';
import { pool } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { identify } from './middleware/auth.js';
import chatsRouter from './routes/chats.js';
import groupsRouter from './routes/groups.js';
import matchingRouter from './routes/matching.js';
import meRouter from './routes/me.js';
import publicRouter from './routes/public.js';

const app = express();
app.set('etag', false);

// CORS: only the hosted client (CORS_ORIGIN, comma-separated) may call the API from a browser.
// Locally Vite proxies /api, so requests are same-origin and CORS_ORIGIN can stay unset.
const allowedOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.includes(origin) ? 204 : 403);
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  req.body ??= {};
  // API data changes constantly (likes, chats); never let the browser reuse an old response.
  res.set('Cache-Control', 'no-store');
  const started = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`));
  next();
});

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api', publicRouter);
app.use('/api', identify); // everything below needs X-User-Id
app.use('/api', meRouter);
app.use('/api', groupsRouter);
app.use('/api', matchingRouter);
app.use('/api', chatsRouter);
app.use('/api', (req) => {
  throw notFound('ROUTE_NOT_FOUND', `No API route for ${req.method} ${req.path}.`);
});
app.use(errorHandler);

// Locally API_PORT wins (the desktop preview launcher sets PORT=5173); hosts like Render set PORT.
const port = Number(process.env.API_PORT || process.env.PORT) || 4000;
app.listen(port, () => console.log(`aura API listening on port ${port}`));
