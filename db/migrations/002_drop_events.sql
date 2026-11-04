-- 002: remove group events (stakeholder decision, 2026-11-04).
-- Drops the events feature's tables and every row in them. Nothing else references them.
-- db/schema.sql no longer creates them for fresh builds.
-- Safe to re-run. Apply with: npm run db:migrate

BEGIN;

DROP TABLE IF EXISTS group_event_attendance;
DROP TABLE IF EXISTS events;

COMMIT;
