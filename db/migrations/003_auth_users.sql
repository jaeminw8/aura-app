-- 003: real sign-in with Supabase Auth.
-- Each users row is owned by one Supabase Auth account (auth.users). Rows without one
-- (seeded users that have no demo login) still exist; they just can't sign in.
-- Needs db/supabase-grants.sql first when run as aura_app. Safe to re-run. Apply with: npm run db:migrate

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Link the demo logins (created with npm run db:demo-accounts) to their seeded users.
UPDATE users u SET auth_user_id = a.id
FROM (VALUES (1, 'avery@example.com'), (2, 'ben@example.com'), (7, 'maya@example.com'), (16, 'zoe@example.com'))
       AS d (user_id, email)
JOIN auth.users a ON lower(a.email) = d.email
WHERE u.id = d.user_id AND u.auth_user_id IS NULL;

COMMIT;
