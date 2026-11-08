// Routes that work before signing in.
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/interests', async (req, res) => {
  const { rows } = await query('SELECT id, name FROM interests ORDER BY name');
  res.json({ interests: rows });
});

export default router;
