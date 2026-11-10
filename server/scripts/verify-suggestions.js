// Checks the AI conversation starters ("Need an opener?") end to end against the running API and the database:
//   1. accepting a request creates the match and chat straight away, without waiting for the AI
//   2. the server asks the AI in the background and saves 3 rows in chat_suggestions
//   3. both groups get the same 3 with the chat   4. a suggestionId that isn't a number is rejected
//   5. sending a message with suggestionId marks that one used (used_at) and it's no longer offered
//   6. once someone from the other group has sent a message too, nobody is offered any
// If the API has no GEMINI_API_KEY it checks the fallback instead: the match, the chat and messages work, with no openers.
// Usage: npm run dev (in another terminal), then npm run verify:suggestions
// It really accepts a request and posts two messages, so run npm run db:reset afterwards to restore the demo
// data (check with the team first on the shared database).
//
// npm run verify:suggestions -- --ai   only asks the AI for openers for an existing match and prints them.
// It saves nothing and doesn't need npm run dev, so it's safe on the shared database. It uses one Gemini request.
import pg from 'pg';
import '../src/env.js';
import { authHeaders, DEMO_ACCOUNTS } from './lib/session.js';

const API = `http://localhost:${process.env.API_PORT || 4000}/api`;
const args = process.argv.slice(2);
const USER_ID = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
};

async function aiOnly() {
  const { AI_MODEL, aiConfigured } = await import('../src/lib/gemini.js');
  const { SUGGESTION_MAX_LENGTH, askForStarters, loadMatchGroups, matchData } = await import('../src/lib/suggestions.js');
  const { pool } = await import('../src/db.js');
  try {
    if (!aiConfigured()) throw new Error('GEMINI_API_KEY is not set. Add it to server/.env (see server/.env.example).');
    const { rows: [chat] } = await pool.query('SELECT id, name FROM chats ORDER BY id LIMIT 1');
    if (!chat) throw new Error('There are no matches yet. Run npm run db:reset first.');
    const groups = await loadMatchGroups(chat.id);
    const told = matchData(groups);
    console.log(`Asking ${AI_MODEL} for openers for "${chat.name}". It is told:`);
    for (const g of told.groups) console.log(`  ${g.name} · ${g.city} · ${g.interests.join(', ') || 'no interests'}`);
    console.log(`  in common: ${told.interestsInCommon.join(', ') || 'nothing'}`);
    const started = Date.now();
    const starters = await askForStarters(groups);
    console.log('');
    check(`the AI answered with ${starters.length} openers that passed every check`, true, `${Date.now() - started}ms`);
    starters.forEach((s, i) => console.log(`      ${i + 1}. ${s}`));
    check(`each is ${SUGGESTION_MAX_LENGTH} characters or fewer`, starters.every((s) => [...s].length <= SUGGESTION_MAX_LENGTH), starters.map((s) => [...s].length).join(', '));
    console.log('\nNothing was saved.');
  } catch (err) {
    check(`the AI step failed: ${err.message}`, false);
  } finally {
    await pool.end();
  }
}

async function call(path, { method = 'GET', body, as = USER_ID } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(await authHeaders(as)), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

async function endToEnd() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const saved = async (chatId) => (await db.query(
    'SELECT id::int, text, used_at FROM chat_suggestions WHERE chat_id = $1 ORDER BY id', [chatId],
  )).rows;
  try {
    const me = await call('/me');
    if (me.status !== 200) throw new Error(`GET /me failed: ${JSON.stringify(me.body)}. Is npm run dev running?`);
    const health = await (await fetch(`${API}/health`)).json();
    const groupId = me.body.activeGroupId;
    const like = (await call(`/groups/${groupId}/incoming-likes`)).body.likes?.[0];
    if (!like) throw new Error('No pending requests to accept. Run npm run db:reset first.');
    await db.connect();
    console.log(`Signed in as ${me.body.user.firstName} ${me.body.user.lastName}; accepting ${like.group.name}. AI openers are ${health.aiOpeners ? 'on' : 'off (no GEMINI_API_KEY)'}.\n`);

    const started = Date.now();
    const accept = await call(`/likes/${like.id}/accept`, { method: 'POST' });
    const chat = accept.body.chat;
    check(`POST /api/likes/${like.id}/accept returns 201 with the new chat, without waiting for the AI`, accept.status === 201 && Boolean(chat?.id), `${Date.now() - started}ms`);
    if (!chat?.id) throw new Error(`No chat came back: ${JSON.stringify(accept.body)}`);

    // An open chat polls like this; the openers arrive on a poll shortly after the match.
    const poll = async (as = USER_ID) => (await call(`/chats/${chat.id}/messages?after=0`, { as })).body;
    let latest = await poll();
    while (latest.suggestionsPending && Date.now() - started < 25000) {
      await new Promise((resolve) => { setTimeout(resolve, 500); });
      latest = await poll();
    }
    const offered = latest.suggestions ?? [];

    if (!health.aiOpeners) {
      check('with no GEMINI_API_KEY the AI step is skipped: the chat has no openers and nothing is saved', offered.length === 0 && (await saved(chat.id)).length === 0);
      const sent = await call(`/chats/${chat.id}/messages`, { method: 'POST', body: { body: `verify:suggestions ${new Date().toISOString()}` } });
      check('and the chat works as usual (a message sends)', sent.status === 201, `status ${sent.status}`);
      return;
    }

    check('3 openers arrive with the chat on a later poll', offered.length === 3, `${offered.length} after ${Date.now() - started}ms`);
    if (offered.length !== 3) throw new Error('The AI step saved nothing. The API\'s log says why: look for the line starting "AI openers:".');
    offered.forEach((s, i) => console.log(`      ${i + 1}. ${s.text}`));
    const rows = await saved(chat.id);
    check('chat_suggestions has those 3 rows, none used yet', rows.length === 3 && rows.every((r) => r.used_at === null) && rows.map((r) => r.id).join() === offered.map((s) => s.id).join());

    const opened = await call(`/chats/${chat.id}/messages`);
    const other = opened.body.participants.find((p) => p.groupId === chat.otherGroup.id && DEMO_ACCOUNTS[p.id]);
    if (!other) throw new Error(`Nobody from ${chat.otherGroup.name} in chat #${chat.id} has a demo login (README "Demo accounts").`);
    check(`${other.firstName} (${chat.otherGroup.name}) is offered the same 3`, JSON.stringify((await poll(other.id)).suggestions) === JSON.stringify(offered));

    const bad = await call(`/chats/${chat.id}/messages`, { method: 'POST', body: { body: 'not saved', suggestionId: 'first' } });
    check('a suggestionId that is not a number gets 400 INVALID_ID', bad.status === 400 && bad.body?.error?.code === 'INVALID_ID', bad.body?.error?.code);

    const [first, second, third] = offered;
    const sent = await call(`/chats/${chat.id}/messages`, { method: 'POST', body: { body: first.text, suggestionId: first.id } });
    const afterFirst = await saved(chat.id);
    check('sending the first one with its suggestionId returns 201 and sets its used_at', sent.status === 201 && afterFirst[0].used_at !== null && afterFirst[1].used_at === null && afterFirst[2].used_at === null);
    check('the other two are still offered, to both groups', JSON.stringify(sent.body.suggestions) === JSON.stringify([second, third])
      && JSON.stringify((await poll(other.id)).suggestions) === JSON.stringify([second, third]));

    const reply = await call(`/chats/${chat.id}/messages`, { method: 'POST', as: other.id, body: { body: second.text, suggestionId: second.id } });
    check(`once ${other.firstName} has replied (both groups have chatted), nobody is offered any`,
      reply.status === 201 && reply.body.suggestions.length === 0 && (await poll()).suggestions.length === 0 && (await poll(other.id)).suggestions.length === 0);
    const final = await saved(chat.id);
    check('chat_suggestions keeps all 3 rows: two with used_at, one never used', final.length === 3 && final.filter((r) => r.used_at !== null).length === 2 && final[2].used_at === null);
  } catch (err) {
    check(err.message, false);
  } finally {
    await db.end().catch(() => {});
  }
}

if (args.includes('--ai')) await aiOnly();
else await endToEnd();

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed.${args.includes('--ai') ? '' : ' Run npm run db:reset to restore the demo data (check with the team first).'}`);
process.exitCode = passed === results.length ? 0 : 1;
