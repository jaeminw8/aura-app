// Thin fetch wrapper. Every request carries the "Signed in as" user in X-User-Id.
const STORAGE_KEY = 'aura.userId';
// Hosted builds call the API on its own origin (set at build time); locally Vite proxies /api.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
let currentUserId = null;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function readStoredUserId() {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function storeUserId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode etc.: the session just won't survive a refresh.
  }
}

export function setApiUser(id) {
  currentUserId = id;
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(currentUserId && { 'X-User-Id': String(currentUserId) }),
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
    if (['NO_GROUP', 'PROFILE_INCOMPLETE', 'UNKNOWN_USER'].includes(err.code)) {
      window.dispatchEvent(new CustomEvent('aura:gate', { detail: err.code }));
    }
    throw err;
  }
  return data;
}
