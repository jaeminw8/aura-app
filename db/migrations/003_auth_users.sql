-- 003: real sign-in with Supabase Auth.
-- Each users row is owned by one Supabase Auth account (auth.users). Rows without one
-- (seeded users that have no demo login) still exist; they just can't sign in.
-- Safe to re-run. Apply with: npm run db:migrate
--
-- Supabase only lets the `postgres` login reference auth.users, so the app's own login (aura_app)
-- adds the column and UNIQUE but skips the foreign key with a warning. To add it, run this file
-- once in Supabase -> SQL Editor (Find Friends App: column added 2026-11-09).
-- Demo logins are linked by npm run db:demo-accounts, not here.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_fkey') THEN
    -- NULL (no access to the auth schema at all) counts as false.
    IF (SELECT has_table_privilege('auth.users', 'REFERENCES') WHERE has_schema_privilege('auth', 'USAGE')) THEN
      ALTER TABLE users ADD CONSTRAINT users_auth_user_id_fkey
        FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    ELSE
      RAISE WARNING 'users.auth_user_id has no foreign key to auth.users yet: run db/migrations/003_auth_users.sql once in the Supabase SQL Editor.';
    END IF;
  END IF;
END $$;

COMMIT;
