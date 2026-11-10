import express from 'express';
import './env.js';
import { pool } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { AI_MODEL, aiConfigured } from './lib/gemini.js';
import { authenticate, identify } from './middleware/auth.js';
import accountRouter from './routes/account.js';
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// aiOpeners: whether this server has a GEMINI_API_KEY, so new matches get AI conversation starters.
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, aiOpeners: aiConfigured() });
});

app.use('/api', publicRouter);
app.use('/api', authenticate); // everything below needs a Supabase session (401 otherwise)
app.use('/api', accountRouter);
app.use('/api', identify); // ...and a users row for that account (403 NO_PROFILE otherwise)
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
app.listen(port, () => {
  console.log(`aura API listening on port ${port}`);
  console.log(aiConfigured()
    ? `AI openers: on (${AI_MODEL})`
    : 'AI openers: off (GEMINI_API_KEY is not set). Everything else works; new chats just have no suggested openers.');
});
