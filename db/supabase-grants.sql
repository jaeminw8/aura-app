-- One-time setup, run as the `postgres` user (Supabase → SQL Editor), not by db:migrate.
-- The app's own login (aura_app) can't see Supabase's auth schema by default. This lets it:
--   * create the users.auth_user_id foreign key (REFERENCES on auth.users.id)
--   * relink the demo logins to their seeded users by email (SELECT on auth.users id + email)
-- Nothing else in auth is readable, and passwords/tokens stay hidden.
-- Safe to re-run. Applied to Find Friends App on 2026-11-08.
GRANT USAGE ON SCHEMA auth TO aura_app;
GRANT REFERENCES (id), SELECT (id, email) ON auth.users TO aura_app;
