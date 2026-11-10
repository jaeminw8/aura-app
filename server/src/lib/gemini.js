// The one place the server talks to the LLM: Google's Gemini API (the Interactions endpoint).
// askForJson sends a prompt and gets back JSON that matches a schema, already parsed.
//
// The key is GEMINI_API_KEY: set it in Render's Environment tab (or server/.env for local work),
// never in the repo. It travels in a header, so it never ends up in a URL or a log line.
// GEMINI_MODEL picks another model. GEMINI_API_URL points at another host (a proxy, or a
// stand-in server in tests).
import '../env.js';

const BASE_URL = (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
export const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 8000;

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

// `retry` says a second try might work: a timeout, a rate limit, a server error or a garbled answer.
// A bad key or a bad request (4xx) won't get better by asking again.
export class AiError extends Error {
  constructor(message, { retry = false } = {}) {
    super(message);
    this.retry = retry;
  }
}

export async function askForJson({ system, input, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError('GEMINI_API_KEY is not set');

  let res;
  try {
    res = await fetch(`${BASE_URL}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: AI_MODEL,
        system_instruction: system,
        input,
        response_format: { type: 'text', mime_type: 'application/json', schema },
        store: false, // we never look the exchange up again, so Google doesn't need to keep it
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const why = err.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000}s` : `couldn't reach the API (${err.cause?.code ?? err.message})`;
    throw new AiError(why, { retry: true });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = [data?.error?.code, data?.error?.message].filter(Boolean).join(': ').slice(0, 200);
    throw new AiError(`HTTP ${res.status}${detail ? ` ${detail}` : ''}`, { retry: res.status === 408 || res.status === 429 || res.status >= 500 });
  }

  // The answer is a list of steps (the model's thinking, then its output); the text is in the output steps.
  const text = (data?.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
  if (!text) throw new AiError(`the answer had no text (status: ${data?.status ?? 'none'})`, { retry: true });
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(`the answer wasn't JSON (status: ${data?.status ?? 'none'})`, { retry: true });
  }
}
