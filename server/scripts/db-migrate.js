// Runs every db/migrations/*.sql file, in name order, against DATABASE_URL (from server/.env).
// Migrations only add to the database (and are safe to re-run), so unlike db:reset this keeps everyone's data.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import '../src/env.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    process.stdout.write(`Running db/migrations/${file} ... `);
    await client.query(await readFile(path.join(dir, file), 'utf8'));
    console.log('done');
  }
  const { rows: [okr] } = await client.query('SELECT * FROM okr_metrics');
  console.log(`OKRs now: KR1 ${okr.kr1_connect_pct}% · KR2 ${okr.kr2_four_plus_pct}% · KR3 ${okr.kr3_message_pct}% · KR4 ${okr.kr4_meetup_pct}%`);
} catch (err) {
  console.error(`\nMigration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
