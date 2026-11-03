import { badRequest } from '../errors.js';

export function parseId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest('INVALID_ID', `${field} must be a positive whole number.`);
  return n;
}

// Trimmed string, or undefined when the field was not sent. Empty optional text becomes null.
export function readText(value, field, { max, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === undefined || value === null) {
    if (required) throw badRequest('VALIDATION_ERROR', `${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} must be text.`);
  const text = value.trim();
  if (!text) {
    if (required) throw badRequest('VALIDATION_ERROR', `${field} can't be empty.`);
    return null;
  }
  if (max && text.length > max) throw badRequest('VALIDATION_ERROR', `${field} must be ${max} characters or fewer.`);
  return text;
}

export const MESSAGE_MAX_LENGTH = 2000;

// Control characters other than tab and newline. Postgres can't store \u0000 at all, and the rest
// are invisible junk that usually comes from a bad paste.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Anything that isn't a space or an invisible character (zero-width space, joiner, BOM...).
const VISIBLE_CHAR = /[^\s​-‍⁠﻿]/u;

// A chat message body, ready to save: Windows line endings become \n, control characters are
// removed, and the ends are trimmed. Rejects anything that is missing, isn't text, has nothing
// visible in it, or is longer than MESSAGE_MAX_LENGTH. Length is counted like Postgres
// char_length, so an emoji counts as one character. Errors are 400 VALIDATION_ERROR with
// details.field = 'body' so the client can show them next to the message box.
export function readMessage(value) {
  const fail = (message, extra) => badRequest('VALIDATION_ERROR', message, { field: 'body', maxLength: MESSAGE_MAX_LENGTH, ...extra });
  if (value === undefined || value === null) throw fail('Type a message before sending.');
  if (typeof value !== 'string') throw fail('Messages must be text.');
  const text = value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
  if (!VISIBLE_CHAR.test(text)) throw fail("Message can't be empty.");
  const length = [...text].length;
  if (length > MESSAGE_MAX_LENGTH) {
    throw fail(`Messages can be up to ${MESSAGE_MAX_LENGTH} characters. This one is ${length}.`, { length });
  }
  return text;
}

export function readInt(value, field, { min, max, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw badRequest('VALIDATION_ERROR', `${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function readTextList(value, field, { maxItems, maxLength, minItems = 0 }) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', `${field} must be a list.`);
  const seen = new Set();
  const items = [];
  for (const raw of value) {
    const text = readText(raw, field, { max: maxLength, required: true });
    if (!seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      items.push(text);
    }
  }
  if (items.length < minItems) throw badRequest('VALIDATION_ERROR', `Pick at least ${minItems} ${field.toLowerCase()}.`);
  if (items.length > maxItems) throw badRequest('VALIDATION_ERROR', `Pick at most ${maxItems} ${field.toLowerCase()}.`);
  return items;
}
