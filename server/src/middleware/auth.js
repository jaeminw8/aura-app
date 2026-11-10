import { createRemoteJWKSet, jwtVerify } from 'jose';
import { query } from '../db.js';
import { ApiError, forbidden } from '../errors.js';
import { parseId } from '../lib/validate.js';

// Supabase signs access tokens with an asymmetric key and publishes the public half,
// so the API can check a token without any shared secret.
const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/$/, '');
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const notSignedIn = () => new ApiError(401, 'NOT_SIGNED_IN', 'Sign in to use aura.');

// Verifies the Supabase session from `Authorization: Bearer <access token>` -> req.auth.
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw notSignedIn();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: 'authenticated' }));
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
    // Couldn't fetch Supabase's public keys: that's our problem (500), not a bad session.
    if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'].includes(err.code) || err.name === 'TypeError') throw err;
    throw notSignedIn();
  }
  req.auth = { id: payload.sub, email: payload.email };
  next();
}

// Loads the users row that belongs to the signed-in account. A brand-new account has none
// until POST /api/users creates it (the client does that right after sign up).
export async function identify(req, res, next) {
  const { rows } = await query(
    'SELECT id, first_name, city, active_group_id FROM users WHERE auth_user_id = $1',
    [req.auth.id],
  );
  if (!rows[0]) throw forbidden('NO_PROFILE', 'Finish creating your account first.');
  req.user = rows[0];
  next();
}

// Onboarding gate: the app is unusable until you belong to a group.
// If the active group was cleared (e.g. you left it), fall back to your oldest group.
export async function requireGroup(req, res, next) {
  if (!req.user.active_group_id) {
    const { rows } = await query(
      `UPDATE users SET active_group_id = (
         SELECT group_id FROM group_memberships WHERE user_id = $1 ORDER BY joined_at LIMIT 1)
       WHERE id = $1 RETURNING active_group_id`,
      [req.user.id],
    );
    req.user.active_group_id = rows[0].active_group_id;
  }
  if (!req.user.active_group_id) {
    throw forbidden('NO_GROUP', 'You need a friend group to use aura. Create one or join one with an invite code.');
  }
  next();
}

// Find and Messages always act as the active group. Returns that group's id,
// rejecting any other group id the client sends.
export function actingGroupId(req, requested) {
  const active = req.user.active_group_id;
  if (requested !== undefined && parseId(requested, 'groupId') !== active) {
    throw forbidden('NOT_ACTIVE_GROUP', 'Switch to this group first. Find and Messages act as your active group.');
  }
  return active;
}
