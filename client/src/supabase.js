// Supabase Auth only (sign up, sign in, session refresh). All app data still goes through our API,
// so this uses the auth package rather than the full supabase-js client.
import { AuthClient } from '@supabase/auth-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  // npm run dev reads client/.env.development; hosted builds get these from render.yaml.
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set when the client is built.');
}

// `supabase.auth` mirrors supabase-js, so its docs apply as written.
export const supabase = {
  auth: new AuthClient({
    url: `${url}/auth/v1`,
    headers: { apikey: key },
    storageKey: 'aura.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }),
};

// Supabase Auth error codes -> what people see. Anything else falls back to Supabase's own message.
const AUTH_MESSAGES = {
  invalid_credentials: "That email and password don't match an account. Check them and try again.",
  user_already_exists: 'There is already an account with that email. Sign in instead.',
  email_exists: 'There is already an account with that email. Sign in instead.',
  weak_password: 'That password is too weak. Use at least 8 characters.',
  email_address_invalid: 'Enter a valid email address.',
  validation_failed: 'Enter a valid email address and password.',
  over_request_rate_limit: 'Too many tries. Wait a minute, then try again.',
  over_email_send_rate_limit: 'Too many tries. Wait a minute, then try again.',
  email_not_confirmed: 'Confirm your email first, then sign in.',
};

export function authErrorMessage(error) {
  if (AUTH_MESSAGES[error?.code]) return AUTH_MESSAGES[error.code];
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
    return "We can't reach aura right now. Check your connection and try again.";
  }
  return error?.message || 'Something went wrong. Try again in a moment.';
}
