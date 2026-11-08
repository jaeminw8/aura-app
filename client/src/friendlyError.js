// Plain-language text for API errors, so people never see "Request failed (500)" or a developer hint
// like "Is npm run dev running?". Add a code here when the server's own message isn't right for people.
const FRIENDLY = {
  NETWORK_ERROR: "We can't reach aura right now. Check your connection and try again.",
  INTERNAL_ERROR: 'Something went wrong on our end. Try again in a moment.',
  UNKNOWN_ERROR: 'Something went wrong. Try again in a moment.',
  GROUP_FULL: 'That group already has 10 members, so no one else can join.',
  CHAT_FULL: 'This chat already has 30 people, the most a chat can have.',
  NOT_ACTIVE_GROUP: 'Switch to that group first, then try again.',
  NOT_IN_CHAT: "You're not in this chat anymore.",
  CHAT_NOT_FOUND: "This chat doesn't exist anymore.",
  ALREADY_MATCHED: "You're already matched with this group. Look for your chat with them below.",
  LIKE_NOT_FOUND: 'That request is no longer available.',
  NOT_SIGNED_IN: 'Sign in to keep going.',
  SESSION_EXPIRED: 'You were signed out. Sign in again to keep going.',
};

export function friendlyError(err) {
  if (FRIENDLY[err?.code]) return FRIENDLY[err.code];
  // The API's 400-range messages are already written for people (like "Message can't be empty.").
  if (err?.status >= 400 && err.status < 500 && err.message) return err.message;
  return FRIENDLY.UNKNOWN_ERROR;
}

// Worth offering "Try again": the network dropped (status 0) or the server failed (5xx).
// A 4xx means the request itself was wrong, so sending it again won't help.
export const canRetry = (err) => !err?.status || err.status >= 500;
