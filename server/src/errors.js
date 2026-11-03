// Every error leaves the API as { error: { code, message, details? } }.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new ApiError(400, code, message, details);
export const forbidden = (code, message, details) => new ApiError(403, code, message, details);
export const notFound = (code, message) => new ApiError(404, code, message);
export const conflict = (code, message, details) => new ApiError(409, code, message, details);

// Errors raised inside Postgres (triggers, constraints) mapped to API errors.
const PG_ERRORS = {
  AU001: [409, 'GROUP_FULL', 'This friend group already has 10 members.'],
  AU002: [409, 'CHAT_FULL', 'This group chat already has 30 people.'],
  23505: [409, 'ALREADY_EXISTS', 'That already exists.'],
  23503: [409, 'INVALID_REFERENCE', 'That refers to something that does not exist.'],
  23514: [400, 'VALIDATION_ERROR', 'A value is out of the allowed range.'],
  23502: [400, 'VALIDATION_ERROR', 'A required value is missing.'],
  '22P02': [400, 'VALIDATION_ERROR', 'A value has the wrong format.'],
  '22001': [400, 'VALIDATION_ERROR', 'A value is too long.'],
  // Text Postgres can't store, such as \u0000 pasted into a bio. Without this it's a 500.
  '22021': [400, 'VALIDATION_ERROR', "A value contains characters that can't be saved."],
  '22P05': [400, 'VALIDATION_ERROR', "A value contains characters that can't be saved."],
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let apiError = err instanceof ApiError ? err : null;

  if (!apiError && PG_ERRORS[err.code]) {
    const [status, code, message] = PG_ERRORS[err.code];
    apiError = new ApiError(status, code, message, err.constraint ? { constraint: err.constraint } : undefined);
  }
  if (!apiError && err.type === 'entity.parse.failed') {
    apiError = badRequest('INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (!apiError) {
    console.error(err);
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our end.');
  }

  const body = { code: apiError.code, message: apiError.message };
  if (apiError.details) body.details = apiError.details;
  res.status(apiError.status).json({ error: body });
}
