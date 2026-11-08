// Thin fetch wrapper. Every request carries the Supabase session as a Bearer token.
import { supabase } from './supabase.js';

// Hosted builds call the API on its own origin (set at build time); locally Vite proxies /api.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  // getSession() refreshes the access token first when it's about to expire.
  const { data: { session } } = await supabase.auth.getSession();
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(session && { Authorization: `Bearer ${session.access_token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const hint = API_BASE ? 'It may be waking up; try again in a minute.' : 'Is `npm run dev` running?';
    throw new ApiError(0, 'NETWORK_ERROR', `Can't reach the aura server. ${hint}`);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(
      res.status,
      data?.error?.code ?? 'UNKNOWN_ERROR',
      data?.error?.message ?? `Request failed (${res.status}).`,
      data?.error?.details,
    );
    // The onboarding gate listens for these and re-checks the user's status.
    if (['NO_GROUP', 'PROFILE_INCOMPLETE', 'NO_PROFILE'].includes(err.code)) {
      window.dispatchEvent(new CustomEvent('aura:gate', { detail: err.code }));
    }
    // The server no longer accepts this session (expired or revoked): sign out locally.
    if (res.status === 401) supabase.auth.signOut({ scope: 'local' });
    throw err;
  }
  return data;
}
