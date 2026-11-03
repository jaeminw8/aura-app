// Checks server-side message validation end to end against the running API and the database:
//   1. empty, whitespace-only, invisible-only, too long, missing, non-text and \u0000 messages are all
//   rejected with 400 VALIDATION_ERROR (details.field = 'body')   2. none of them saved a row
//   3. a 2000-emoji message isn't rejected for length (emoji count as 1 character, like Postgres).
//   That one is sent to a chat that doesn't exist, so it passes validation and stops at 404.
// Usage: npm run dev (in another terminal), then npm run verify:messages
// By default it saves nothing, so it's safe on the shared database. Add --post to also send two real
// messages and check they're saved trimmed and without control characters (npm run verify:messages -- --post).
import pg from 'pg';
import '../src/env.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const USER_ID = 1;
const POST = process.argv.includes('--post');
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

async function post(chatId, payload) {
  const res = await fetch(`${API}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'X-User-Id': String(USER_ID), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const countMessages = async () => (await db.query('SELECT count(*)::int AS n FROM messages')).rows[0].n;

try {
  await db.connect();
  const { rows: [mine] } = await db.query(
    'SELECT chat_id::int AS id FROM chat_participants WHERE user_id = $1 ORDER BY chat_id LIMIT 1',
    [USER_ID],
  );
  if (!mine) throw new Error(`User #${USER_ID} isn't in any chat. Run npm run db:reset first.`);
  console.log(`Sending as user #${USER_ID} to chat #${mine.id}\n`);

  const before = await countMessages();
  const rejected = [
    ['an empty message', { body: '' }],
    ['a message of only spaces, tabs and newlines', { body: '   \n\t  \r\n ' }],
    ['a message of only zero-width spaces', { body: '​​​' }],
    ['a message of only control characters (\\u0000)', { body: '\u0000\u0007' }],
    ['a 2001-character message', { body: 'a'.repeat(2001) }],
    ['2001 characters with spaces around them (still too long after trimming)', { body: `  ${'b'.repeat(2001)}  ` }],
    ['a request with no body field', {}],
    ['a null body', { body: null }],
    ['a number instead of text', { body: 42 }],
    ['a list instead of text', { body: ['hi'] }],
  ];
  for (const [label, payload] of rejected) {
    const res = await post(mine.id, payload);
    const err = res.body.error;
    check(`${label} -> 400 VALIDATION_ERROR`, res.status === 400 && err?.code === 'VALIDATION_ERROR' && err?.details?.field === 'body', `${res.status} ${err?.code}: ${err?.message}`);
  }
  const tooLong = await post(mine.id, { body: 'a'.repeat(2500) });
  check('the too-long error says the limit and the length', tooLong.body.error?.details?.maxLength === 2000 && tooLong.body.error?.details?.length === 2500, tooLong.body.error?.message);
  check('none of the rejected messages were saved', (await countMessages()) === before, `${before} messages before and after`);

  const { rows: [{ id: missingChat }] } = await db.query('SELECT coalesce(max(id), 0)::int + 1000 AS id FROM chats');
  const emoji = await post(missingChat, { body: '\u{1F389}'.repeat(2000) });
  check('2000 emoji pass the length check (sent to a chat that does not exist, so it stops at 404)', emoji.status === 404 && emoji.body.error?.code === 'CHAT_NOT_FOUND', `${emoji.status} ${emoji.body.error?.code}`);

  if (POST) {
    const padded = await post(mine.id, { body: '   Trimmed before saving   \n' });
    check('a padded message is saved trimmed (201)', padded.status === 201 && padded.body.message?.body === 'Trimmed before saving', JSON.stringify(padded.body.message?.body));
    const junk = await post(mine.id, { body: 'Line one\r\nLine\u0000 two\u0007' });
    check('control characters are removed and \\r\\n becomes \\n', junk.status === 201 && junk.body.message?.body === 'Line one\nLine two', JSON.stringify(junk.body.message?.body));
    const { rows } = await db.query('SELECT body FROM messages WHERE id = ANY($1) ORDER BY id', [[padded.body.message?.id ?? 0, junk.body.message?.id ?? 0]]);
    check('the database rows match what the API returned', rows.length === 2 && rows[0].body === 'Trimmed before saving' && rows[1].body === 'Line one\nLine two');
  }
} catch (err) {
  check(err.message, false);
} finally {
  await db.end().catch(() => {});
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed.${POST ? ' Run npm run db:reset (after checking with the team) to remove the two test messages.' : ''}`);
process.exitCode = passed === results.length ? 0 : 1;
