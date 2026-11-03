# aura: project guide

Mobile-first web app that helps friend groups find and meet other friend groups (Team Aura class project). See README.md for setup and the vertical-slice demo.

Machine-specific notes (paths, accounts, local setup) belong in `CLAUDE.local.md`, which is git-ignored. Never put them here.

## Stack
- `client/`: React 19 + Vite 7, plain CSS (`client/src/styles.css` holds the design tokens). Hash routes: `#/find`, `#/messages`, `#/messages/:chatId`, `#/profile`. There is no Map tab; it's out of scope.
- `server/`: Node + Express 5 REST API. It talks to Postgres with `pg` only. Don't add the Supabase JS client.
- `db/`: `schema.sql` (drops and recreates everything) and `seed.sql` (truncates, then inserts demo data).
- `docs/`: ERD as `erd.dbml`, `erd.mmd` and `erd.png` (`npx @mermaid-js/mermaid-cli -i docs/erd.mmd -o docs/erd.png`).
- Database: the shared Supabase project **Find Friends App**, reached through the Session pooler (port 5432). The connection string lives only in `server/.env`.

## Commands (run from the repo root)
- `npm install`: installs both workspaces.
- `npm run dev`: starts the API (`API_PORT`, default 4000) and Vite (5173, which proxies `/api` to the API).
- `npm run db:check`: connects with `server/.env` and prints the `users` row count. It's read-only.
- `npm run db:reset`: runs schema then seed. **This wipes the shared team database.** Ask the team (or the user) before running it.
- `npm run verify:slice`: end-to-end check of the Accept flow. It mutates data, so follow it with `db:reset` only if the team agrees.
- `npm run verify:chat`: end-to-end check of live chat updates (`?after=` polling, list re-sort). It posts a real message and marks a chat read, so ask the team before running it on the shared database, and follow it with `db:reset` only if the team agrees.
- `npm run verify:messages`: checks that bad messages (empty, whitespace or invisible only, `\u0000`, too long, not text) get `400 VALIDATION_ERROR` and save nothing. It's read-only and safe on the shared database; `-- --post` also saves two test messages.
- `npm run build`: production build of the client.

## Conventions
- API errors are always `{ error: { code, message, details? } }` with codes like `GROUP_FULL`, `NO_GROUP`, `NOT_ACTIVE_GROUP`. Database trigger errors (`AU001`, `AU002`) are mapped in `server/src/errors.js`.
- Prototype auth is the `X-User-Id` header set by the "Signed in as" picker. The server still checks membership and the active group on every request.
- Find, likes, the incoming-likes inbox and the chat list always act as the user's **active group** (`actingGroupId` in `server/src/middleware/auth.js`).
- Anything that has to be atomic goes through `withTransaction` (`server/src/db.js`), for example `recordDecision` in `server/src/lib/matching.js`.
- The JSON the API returns is camelCase; database columns are snake_case.
- UI: inline stroke SVG icons (`components/Icon.jsx`), no emoji, initials-on-pastel avatars, touch targets of at least 44px.
- Loading states come from `components/Loading.jsx`: `Skeleton` rows built from the real rows' classes where the layout is known, otherwise `Loader` (spinner and label). Mark the loading area `aria-busy="true"` and pair skeletons with a `LoadingStatus` (`role="status"`). The global `prefers-reduced-motion` rule in `styles.css` stops every animation.
- Layout: below 1024px wide it's the phone layout (430px column, bottom tab bar). At 1024px and up, `App.jsx` (`useMediaQuery`) switches to the desktop layout: a sidebar (`SideNav`), Messages as list + chat panes, Find card side by side, and Profile in two columns. All desktop CSS lives in the `min-width: 1024px` blocks at the end of `styles.css`. Keep phone styles outside those blocks.
- Schema changes go in `db/schema.sql` (and the ERD files), never only by hand in the Supabase dashboard.

## Business rules (enforced on the server or in the database)
- A Friend Group has at most 10 members (trigger `group_member_cap`, which raises `GROUP_FULL`). A chat has at most 30 people (`chat_participant_cap`, which raises `CHAT_FULL`).
- A user can be in several groups but has one active group, which must be one of their own groups (composite FK `users_active_group_is_membership`).
- A group's shared interests are the union of its members' interests, computed by the `group_shared_interests` view and never stored.
- Two groups match when each group has a `connect` row in `group_likes` toward the other. The match, its chat and all members of both groups as participants are created in one transaction.
- Recommendations are ranked by shared interests, then 1st-degree mutual friends, then 2nd-degree, then same city, then distance. They exclude your own groups and any group the active group has already liked, passed on or matched with.
- Onboarding gate: the app is unusable without a group (`403 NO_GROUP`). Creating or joining a group requires a complete profile (`403 PROFILE_INCOMPLETE`).

## Secrets
- Never commit `server/.env`, real passwords or full connection strings. `server/.env.example` only has placeholders.
- `.claude/` (local Claude Code settings) and `CLAUDE.local.md` are git-ignored.
