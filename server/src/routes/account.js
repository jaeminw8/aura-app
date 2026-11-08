// Needs a valid session but no users row yet: creating that row is the last step of sign up.
import { Router } from 'express';
import { query } from '../db.js';
import { conflict } from '../errors.js';
import { randomPastel, userInitials } from '../lib/format.js';
import { readText } from '../lib/validate.js';

const router = Router();

// Just the basics. The rest of the profile is filled in with PATCH /api/me.
router.post('/users', async (req, res) => {
  const firstName = readText(req.body.firstName, 'First name', { max: 50, required: true });
  const lastName = readText(req.body.lastName, 'Last name', { max: 50, required: true });
  const city = readText(req.body.city, 'City', { max: 80, required: true });
  const { rows: [u] } = await query(
    `INSERT INTO users (first_name, last_name, city, avatar_color, auth_user_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (auth_user_id) DO NOTHING
     RETURNING id, first_name, last_name, avatar_color`,
    [firstName, lastName, city, randomPastel(), req.auth.id],
  );
  if (!u) throw conflict('ACCOUNT_EXISTS', 'This account already has a profile.');
  res.status(201).json({
    user: {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      initials: userInitials(u.first_name, u.last_name),
      avatarColor: u.avatar_color,
    },
  });
});

export default router;
