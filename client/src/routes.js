// Signed-out pages remember where you were going: #/signin?next=/messages/7.
// Only real app pages are accepted as `next`.
export const APP_PATH = /^\/(find|messages(\/\d+)?|profile)$/;

export const authHref = (page, next) => `#/${page}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
