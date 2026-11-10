# aura

**Live app: [https://aura-is401.onrender.com](https://aura-is401.onrender.com)**

A mobile-first web app that helps groups of friends find and meet other friend groups. Built by Team Aura: Clint Burton, David Medina, Jaemin Weight and Julian Miles.

The live app works on phones and desktops. Sign up with an email and password, or sign in with one of the [demo accounts](#sign-in-and-demo-accounts). The API runs on Render's free plan, so after about 15 idle minutes the first request takes up to a minute while it wakes up.

## App Summary

Friend groups often want to meet other friend groups and do things together: a game night, a hike, a pickup game. But they don't know where to find those groups or which ones are open to meeting new people. This is common for college students and young adults who have moved to a new city, or whose circle has gotten small, and existing apps match individuals for dating or networking rather than whole groups. aura lets each person build a profile and join or create a Friend Group of up to 10 people, then go through recommended groups one at a time, choosing Connect or Pass on behalf of their active group. Recommendations are ranked by shared interests, then mutual friends, then whether the group is in the same city. When one member of each group says "Connect", from Find or by accepting in the "Groups that liked you" inbox, the two groups match and aura automatically opens a shared group chat with everyone from both groups.

## Behavioral Requirements

From our Product Requirements Document.

| # | Requirement | Status | How it works in aura |
|---|---|---|---|
| 1 | When the user joins, the system prompts them to create a profile (personal info, photos, interests) and join or create a Friend Group. | **Not complete** | New users go through profile setup, then must create or join a group (`403 PROFILE_INCOMPLETE` until the profile is done). Photos are labeled placeholder slots (1–3 required); uploading real image files is not built yet. |
| 2 | When a user updates their interests, the shared Friend Group interests update automatically. | **Complete** | Group interests come from the `group_shared_interests` view (the union of members' interests), so they're never stored and change the moment a member edits theirs. |
| 3 | A Friend Group can't have more than 10 members; adding an 11th fails with an error returned to the user. | **Complete** | The `group_member_cap` trigger rejects the insert and the API returns `409 GROUP_FULL`, shown as an error in the app (try joining Wednesday Volleyball, which is full). |
| 4 | Users who aren't in a Friend Group get an error inviting them to create or join one before they can use the app. | **Complete** | Every group-scoped endpoint returns `403 NO_GROUP`, and the app shows the "Create or join a group" screen. |
| 5 | The matching screen shows one Friend Group at a time; after Connect or Pass, a new group is shown. | **Complete** | Find shows one card with labeled Pass and Connect buttons (swipe left/right on touch screens), then loads the next recommendation. |
| 6 | The system recommends Friend Groups based on mutual friends and interests. | **Complete** | `GET /api/recommendations` scores shared interests and mutual friends. |
| 7 | When a user swipes on another group, the system notifies that group's users. | **Complete** | A Connect shows up in the other group's "Groups that liked you" box in Messages (in-app; no push notifications). |
| 8 | Two groups match when one user from each says yes, from Find or from the inbox. | **Complete** | A reciprocal `connect` in `group_likes` creates the match, whether it comes from Find or from Accept. |
| 9 | Recommendations are ranked by (1) shared interests, (2) 1st- and 2nd-degree mutual connections, (3) geographic proximity. | **Complete** | Ordered by shared interests, then 1st-degree, then 2nd-degree mutual friends, then same city, then distance. Groups you already liked, passed or matched are excluded. |
| 10 | When two groups match, a group chat is created for both groups. | **Complete** | The match, its chat and every member of both groups as participants are created in one transaction (capped at 30 people by `chat_participant_cap`). |

**9 of 10 complete.**

## Vertical Slices

Each slice works end to end: a screen in the app, an API endpoint, and rows in Postgres, live at the URL above. **Target for Sprint 2: 10. Working now: 15.**

| # | Slice | What the user does | API | Database |
|---|---|---|---|---|
| 1 | Sign up and sign in | **Sign up** (name, city, email, password) goes straight to profile setup; returning users use **Sign in** ("Already have an account?") | Supabase Auth, then `POST /api/users`; every request sends the session as `Authorization: Bearer` | `auth.users`, `users.auth_user_id` |
| 2 | Profile and interests | Profile → edit bio, details and interests | `PATCH /api/me` | `users`, `user_interests` (group interests update through the `group_shared_interests` view) |
| 3 | Profile photos | Profile → add or remove a photo (1–3, placeholder images) | `POST /api/me/photos`, `DELETE /api/me/photos/:id` | `user_photos` |
| 4 | Onboarding gate | A user with no group sees "Create or join a group" instead of the app | any group endpoint → `403 NO_GROUP` | `group_memberships` |
| 5 | Create a group | Gate or Profile → **Create a group** | `POST /api/groups` | `friend_groups`, `group_memberships`, `users.active_group_id` |
| 6 | Join with an invite code | Enter a code; a full group shows "already has 10 members" | `POST /api/groups/join` → `409 GROUP_FULL` when full | `group_memberships` (`group_member_cap` trigger) |
| 7 | Invite a friend to your group | Profile → **Invite friends** → pick a friend | `GET /api/me/friends`, `POST /api/groups/:id/members` | `friendships`, `group_memberships`, `chat_participants` |
| 8 | Edit group and leave group | Profile → edit group name, or **Leave group** | `PATCH /api/groups/:id`, `DELETE /api/groups/:id/members/me` | `friend_groups`, `group_memberships`, `chat_participants` |
| 9 | Switch active group | Group switcher on Find or "Chatting as" on Messages | `PATCH /api/me/active-group` | `users.active_group_id` (composite FK to memberships) |
| 10 | Find, Connect and Pass | Find shows one ranked group at a time; **Connect** or **Pass** loads the next | `GET /api/recommendations`, `POST /api/groups/:id/likes` | `group_likes`; a mutual Connect creates the match and chat |
| 11 | Accept or decline a request | Messages → "Groups that liked you" → **Accept** (new chat appears) or decline | `GET /api/groups/:id/incoming-likes`, `POST /api/likes/:id/accept`, `POST /api/likes/:id/decline` | `group_likes`, `group_matches`, `chats`, `chat_participants` in one transaction |
| 12 | Group chat with live updates | Open a chat, send a message; the other group sees it within ~5 seconds | `GET /api/chats/:id/messages?after=`, `POST /api/chats/:id/messages` | `messages`, `chat_participants.last_read_at` |
| 13 | Archive, delete and restore chats | Messages → **Select all** or pick chats → archive / delete; restore from Recently deleted | `GET /api/groups/:id/chats?view=`, `POST /api/chats/bulk` | `chat_participants` (per-person archived/deleted state) |
| 14 | Read receipts | Open a chat: small avatars show who has read how far, and your latest message says **Delivered** until someone reads it | `GET /api/chats/:id/messages` (`reads`) | `chat_participants.last_read_at`, `messages` |
| 15 | Typing indicator | Type in a chat: the other members see "Avery is typing…" within a few seconds, gone about 5 seconds after you stop | `POST`/`DELETE /api/chats/:id/typing`, `GET /api/chats/:id/messages` (`typing`) | `chat_participants.typing_at` |

Slice 11 has a step-by-step walkthrough in [Verifying the Vertical Slice](#verifying-the-vertical-slice), slice 12 in [Live Chat Updates](#live-chat-updates), slice 14 in [Read Receipts](#read-receipts), and slice 15 in [Typing Indicator](#typing-indicator).

### Sprint 2 JW verification

The Sprint 2 JW-assigned changes are tracked in [`docs/vertical-slice-verification.md`](docs/vertical-slice-verification.md). The tracker covers real sign-up/profile setup, group creation and invite-link joining, Find location and member profiles, removal of the group Status field, matching, and chat. Each row must be re-verified on the deployed URL with a real login before the Trello card is moved to Done.

## System Architecture

![aura system architecture](docs/architecture.png)

- **Customer app:** users use the React website, which sends requests to our Express server. The server saves and loads data in Supabase, which also handles logins. Both run live on Render.
- **AI service (planned):** the server sends both groups' interests to an AI service, which returns chat suggestions to get a conversation started.
- **Admin portal (planned, AWS):** an admin uses HTML/CSS pages backed by an Express server and its own database.
- **Where the apps connect:** the admin server reads app data from Supabase.

## ERD

![aura entity relationship diagram](docs/erd.png)

- Full model with every relationship's cardinality: [`docs/erd.dbml`](docs/erd.dbml) (paste into [dbdiagram.io](https://dbdiagram.io))
- Mermaid version: [`docs/erd.mmd`](docs/erd.mmd)
- The SQL that implements it: [`db/schema.sql`](db/schema.sql), with sample data in [`db/seed.sql`](db/seed.sql)

Business rules are enforced in the database, not just the UI:
- A trigger caps a group at 10 members (`GROUP_FULL`) and a chat at 30 people (`CHAT_FULL`).
- Unique constraints prevent duplicate likes, memberships and matches.
- A composite foreign key ensures your active group is one you belong to.
- A group's shared interests come from the `group_shared_interests` view, so they're never stored and update the moment a member edits their interests.

## OKR Metrics

All four Key Results are computed automatically by the `okr_metrics` view (in [`db/schema.sql`](db/schema.sql)). It's one row, recalculated from the live tables every time you read it, so nothing has to be counted by hand or kept in sync. To see it, run `SELECT * FROM okr_metrics;` in Supabase's **SQL Editor**, or open the view in the **Table Editor**.

| KR | Measures | Column (count → percentage) | Formula | What updates it |
|---|---|---|---|---|
| **KR1** | % of registered groups that connect with another group | `connected_groups` → `kr1_connect_pct` | groups in at least one `group_matches` row ÷ all `friend_groups` | A **match**: two groups both say Connect (Find or Accept in "Groups that liked you") → new `group_matches` row. A **new group** → new `friend_groups` row (raises the denominator). |
| **KR2** | % of groups with 4+ people | `four_plus_groups` → `kr2_four_plus_pct` | groups with ≥ 4 `group_memberships` rows ÷ all `friend_groups` | Someone **creates, joins or leaves** a group, or is **invited** into one → `group_memberships` row added or removed. |
| **KR3** | % of connected groups that exchange messages | `messaging_groups` → `kr3_message_pct` | connected groups with a match chat where **both** groups have sent at least one message ÷ connected groups | A **message is sent** → new `messages` row. The sender's side comes from `chat_participants.group_id`. A chat where only one group has talked doesn't count yet. |
| **KR4** | % of connected groups that meet up | `meetup_groups` → `kr4_meetup_pct` | connected groups with at least one `meetups` row for any of their matches ÷ connected groups | A **meetup is confirmed** → new `meetups` row (`match_id`, `confirmed_by_user_id`, `created_at`). |

Notes:
- **KR4 has no button in the app yet.** The `meetups` table is the groundwork; the next step is a "We met up" action in a match's chat that inserts a row. Until then, add rows in the Table Editor, as the seed does for Tuesday Crew + Sunday Summit Club.
- A percentage is empty (`NULL`) instead of an error when its denominator is 0, for example KR3 and KR4 before any group has matched.
- **Updating an existing database:** schema changes that must keep everyone's other data go in `db/migrations/` as files that are safe to re-run. `npm run db:migrate` runs them all and prints the current KRs. `db/schema.sql` matches the result, so a fresh `npm run db:reset` ends up the same. `001_okr_metrics.sql` adds the OKR table and view; `002_drop_events.sql` removes the events feature (its two tables and their rows). Both are applied to Find Friends App.

## Tech Stack

| Layer | Choice | Why it fits our team |
|---|---|---|
| Frontend | **React + Vite**, plain CSS (`/client`) | The most widely used UI library, so everyone on the team can contribute. Vite starts in under a second and reloads on save. Plain CSS with design tokens (no UI framework) keeps the mockups' look exact without another thing to learn. |
| Backend | **Node + Express** REST API (`/server`) | The same language as the frontend, so nobody has to switch languages. Express is small enough to read end to end, and each screen maps to a few clear endpoints that return JSON errors like `409 GROUP_FULL`. |
| Database | **PostgreSQL on Supabase**, accessed with `pg` | The free tier covers everything we need at this stage. Supabase's **Table Editor** lets the whole team see rows appear as we click through the app. All four of us point at **one shared database** (the Supabase project Find Friends App), so nobody's local setup drifts and seed data is the same for everyone. We use Supabase only as a Postgres host with plain SQL, so the work stays portable and shows real relational design (constraints, triggers, views). |
| Auth | **Supabase Auth** (email + password) | Supabase already hosts our database, so its Auth service adds real accounts without another vendor. The client uses only the small `@supabase/auth-js` package; the API checks each session token against Supabase's published signing keys (`jose`), so it needs no shared secret, and all app data still goes through our API. |
| Tooling | npm workspaces, `concurrently` | `npm install` installs everything once. `npm run dev` starts both servers, and `npm run db:reset` rebuilds the database from the SQL files. |

## How to Get It Running

These steps assume a fresh clone and no prior knowledge of the project. The whole team shares **one** database, the Supabase project **Find Friends App**, so you don't create your own.

1. **Install Node.js 20 or newer** (we develop on Node 24). Check with `node -v`. Get it from [nodejs.org](https://nodejs.org).

2. **Clone and install.**
   ```bash
   git clone https://github.com/julianmiles03/aura-app.git
   cd aura-app
   npm install
   ```

3. **Copy the connection string from Supabase.** Julian has to invite you to the Supabase organization first.
   1. In [Supabase](https://supabase.com/dashboard), open the project **Find Friends App**. Use only this project; any other project in the list (for example TESTAQUARIUM) is unrelated and has none of our tables.
   2. Click **Connect** (top bar) → **Direct** → **Session pooler** → **Type: URI** → copy. Don't retype it.
   3. Check the username, the part right after `postgresql://`. It must be **`postgres.rcyafwgjnnlgnakwkksi`**, not just `postgres`. The whole string looks like:
      `postgresql://postgres.rcyafwgjnnlgnakwkksi:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
      Use the Session pooler (port 5432), not the Direct connection (`db.rcyafwgjnnlgnakwkksi.supabase.co`). The direct one is IPv6-only on the free tier and won't connect from most home or campus networks.

4. **Get the database password from Julian by DM.** Replace `[YOUR-PASSWORD]` (including the brackets) with it. If the password contains `@ # / ? %`, percent-encode those characters (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `?` → `%3F`, `%` → `%25`).
   **Never reset the database password in Supabase.** Resetting it breaks everyone else's connection.

5. **Create your `.env` file** and paste the full string as `DATABASE_URL`:
   ```bash
   cp server/.env.example server/.env
   ```
   Open `server/.env` and replace the whole `DATABASE_URL=...` line with `DATABASE_URL=<the string from steps 3–4>`. Set `SUPABASE_URL=https://rcyafwgjnnlgnakwkksi.supabase.co`, and copy `SUPABASE_PUBLISHABLE_KEY` from `client/.env.development` (it's public). Get `DEMO_PASSWORD` from Julian by DM; only the demo and `verify:*` scripts use it. `server/.env` is git-ignored, so your passwords never get committed.

6. **Check the connection.**
   ```bash
   npm run db:check
   ```
   You should see `OK: users table has N rows. Your server/.env is right.` If not, it prints the exact fix (see Troubleshooting below). This check is read-only and safe to run any time.

7. **Start the app.**
   ```bash
   npm run dev
   ```
   This starts the API on http://localhost:4000 and the web app on http://localhost:5173. **Open http://localhost:5173** and sign in with a [demo account](#sign-in-and-demo-accounts) or sign up. On a desktop it renders at phone width; for the true mobile view, use your browser's device toolbar.

The tables and sample data already exist in Find Friends App. `npm run db:reset` rebuilds them from `db/schema.sql` and `db/seed.sql`, but it **wipes everyone's data on the shared database**, so only run it after the team agrees.

**Troubleshooting**
- **`Tenant or user not found`** or **`no tenant identifier provided`**: the username is missing the project ref. It must be `postgres.rcyafwgjnnlgnakwkksi`, not `postgres`. Re-copy the Session pooler URI.
- **`password authentication failed`**: the password is wrong, or it has special characters that aren't percent-encoded. Ask Julian for the current password. Don't reset it.
- **`DATABASE_URL is not set`**: `server/.env` is missing, or still has a placeholder like `<your-db-password>` or `[YOUR-PASSWORD]`.
- **`ENOTFOUND` / `ENETUNREACH` / timeouts**: you copied the Direct connection (`db.….supabase.co`). Use the Session pooler URI instead.
- **`relation "users" does not exist`**: you're connected to the wrong Supabase project. Use Find Friends App.
- The page says it can't reach the server: make sure `npm run dev` is still running.

## Deployment

The live app runs on [Render](https://render.com), set up from [`render.yaml`](render.yaml) (a Render Blueprint) in Julian's Render account:

- **`aura-is401-api`** (web service): the Express API. `DATABASE_URL` is set in Render's Environment tab, never in the repo. `CORS_ORIGIN` allows only the client's URL to call the API from a browser.
- **`aura-is401`** (static site): the Vite build of the client. `VITE_API_URL` tells it where the API lives, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` point it at Supabase Auth; all are baked in at build time and are public.
- The API's `SUPABASE_URL` (also public) is where it fetches Supabase's signing keys to check sessions.

Every push or merge to `main` redeploys both automatically (about a minute); nothing to click. To set it up from scratch: Render Dashboard → **New → Blueprint** → pick this repo → paste the Session pooler URI as `DATABASE_URL` → **Apply**. If Render gives either service a different URL (it adds a suffix when a name is taken), update `CORS_ORIGIN` and `VITE_API_URL` to match.

## Sign In and Demo Accounts

Accounts are **Supabase Auth** users (email + password). New visitors see **Sign up**; "Already have an account? Sign in" goes to the separate sign-in page.

- **Sign up** creates the Supabase Auth account, then the app creates its `users` row (`POST /api/users`, linked by `users.auth_user_id`) and goes to profile setup.
- **Every API request** sends the session as `Authorization: Bearer <access token>`. The API verifies it against Supabase's published signing keys and loads the `users` row for that account. No token, a bad token or an expired one gets **`401`** (`NOT_SIGNED_IN` or `SESSION_EXPIRED`) and the app goes back to Sign in. A valid session with no `users` row gets `403 NO_PROFILE`, and the app asks for name and city. Only `GET /api/interests` and `GET /api/health` work without signing in.
- **Staying signed in:** the session is saved in the browser (local storage), so it survives a refresh and closing the tab, and Supabase renews it in the background. It ends when you press **Log out** (on Profile, and also in the sidebar on a desktop) or when the API rejects it.
- **Back to where you were:** opening any app page while signed out, such as a link to `#/messages/7`, goes to Sign in as `#/signin?next=/messages/7`. Signing in, or switching to Sign up from there, returns to that page. The same happens when a session expires. A bare URL with no page shows Sign up (new visitors), Log out goes to plain Sign in, and `next` only accepts aura's own pages (`/find`, `/messages`, `/messages/<id>`, `/profile`).
- **Supabase settings:** Authentication → Sign In / Providers → Email has **Confirm email off** (Supabase's built-in email is limited to a few messages an hour) and a minimum password length of 8.

**Demo accounts.** Every seeded user can sign in. All 16 share one password, which Julian sends to the team privately. It is **never** in this repo, because the repo is public. Groups below are from fresh seed data; the live database may have changed since.

| # | Email | Signs in as | Active group | Also in | Good for |
|---|---|---|---|---|---|
| 1 | `avery@example.com` | Avery Hansen | Tuesday Crew | Wednesday Volleyball | Main demo user: 2 incoming requests to Accept |
| 2 | `ben@example.com` | Ben Kim | Tuesday Crew | - | Only in Tuesday Crew, so they can Accept any request to it |
| 3 | `chloe@example.com` | Chloe Martin | Tuesday Crew | Wednesday Volleyball | - |
| 4 | `diego@example.com` | Diego Ramos | Tuesday Crew | Wednesday Volleyball | - |
| 5 | `emma@example.com` | Emma Wright | Tuesday Crew | - | - |
| 6 | `finn@example.com` | Finn Taylor | Tuesday Crew | Wednesday Volleyball | - |
| 7 | `maya@example.com` | Maya Patel | Sunday Summit Club | - | Chats with Tuesday Crew (live chat and read receipts) |
| 8 | `theo@example.com` | Theo Nguyen | Sunday Summit Club | Film Fridays | - |
| 9 | `priya@example.com` | Priya Shah | Sunday Summit Club | Court Crew | - |
| 10 | `sam@example.com` | Sam Jensen | Sunday Summit Club | Wednesday Volleyball | - |
| 11 | `jordan@example.com` | Jordan Reyes | Sunday Summit Club | Court Crew | - |
| 12 | `lena@example.com` | Lena Novak | Sunday Summit Club | Film Fridays, Wednesday Volleyball | - |
| 13 | `grace@example.com` | Grace Lee | Court Crew | Film Fridays, Wednesday Volleyball | Court Crew liked Tuesday Crew |
| 14 | `eli@example.com` | Eli Brooks | Court Crew | Film Fridays, Wednesday Volleyball | - |
| 15 | `noah@example.com` | Noah Carter | Court Crew | Wednesday Volleyball | - |
| 16 | `zoe@example.com` | Zoe Adams | Wednesday Volleyball | Film Fridays | Wednesday Volleyball is full (10 of 10) |

To see onboarding, sign up as someone new. The `verify:*` scripts sign in as these accounts with `DEMO_PASSWORD` from `server/.env`.

**Setting them up (already done for Find Friends App):**
1. Run `npm run db:migrate`. Migration `003_auth_users.sql` adds `users.auth_user_id`.
2. Run [`db/migrations/003_auth_users.sql`](db/migrations/003_auth_users.sql) once more in Supabase → SQL Editor. Supabase only lets the `postgres` login reference `auth.users`, so this is what adds the foreign key. The app's own login skips it with a warning.
3. Put `DEMO_PASSWORD` in `server/.env`, then run `npm run db:demo-accounts`. It creates the 16 logins and links them by id.

Run `npm run db:demo-accounts` again after any `db:reset`: a reset keeps the logins but unlinks them. It's safe to re-run.

## How We Merge

`main` is what's live, so changes reach it only through a pull request.

1. **Branch.** Start from an up-to-date `main`: `git checkout main && git pull`, then `git checkout -b yourname/short-description`.
2. **Pull request.** Commit, `git push -u origin yourname/short-description`, and open a PR into `main` on GitHub. Say what changed and how you tested it.
3. **Review.** The **CI** check (GitHub Actions) runs `npm ci && npm run build` on every PR; it must be green. A teammate reads the PR and approves it or asks for changes.
4. **Merge.** Click **Merge pull request** and delete the branch. Render redeploys the live app from `main` within about a minute. Open https://aura-is401.onrender.com and check your change.

## Verifying the Vertical Slice

The vertical slice is **Accept** in "Groups that liked you". It goes from the browser through the API into Postgres and back, without a page reload.

1. **Sign in as Avery Hansen** (`avery@example.com`, active group Tuesday Crew; see [Demo Accounts](#sign-in-and-demo-accounts)). If you're signed in as someone else, press **Log out** on Profile first.
2. **Go to Messages and click Accept on a request.** The purple box says "2 groups want to meet Tuesday Crew" (Court Crew and Film Fridays). Click **Accept** on one of them. The client sends `POST /api/likes/:id/accept`. In one database transaction, the server records Tuesday Crew's "connect", creates the `group_matches` row, creates the `chats` row, and adds every member of both groups to `chat_participants`. It then returns the new chat.
3. **See the new chat appear.** The request disappears from the box, and the new chat, for example "Tuesday Crew + Court Crew · 11 people", appears highlighted at the top of the Chats list with no reload. Tap it to send the first message.
4. **Refresh the page and confirm it's still there.** Press reload. The request stays gone and the chat is still at the top of Chats.
5. **Confirm the new rows in Supabase's Table Editor.** In your Supabase project, open **Table Editor**:
   - `group_matches` has a new row pairing group 1 (Tuesday Crew) with the group you accepted.
   - `chats` has a new row named after both groups, whose `match_id` points to that match.
   - `chat_participants` has a row for each member of both groups (filter by the new `chat_id`).

   The new match and chat have the same timestamp, because they were created in the same transaction.

### Verifying Decline

The **Decline** action in "Groups that liked you" asks for confirmation before sending `POST /api/likes/:id/decline`. After confirmation, the request disappears without a page reload. Refresh Messages to confirm it stays gone, then open Find and confirm the declined group is not recommended again. In Supabase's **Table Editor**, the original `group_likes` row should have `decision = 'pass'`.

With `npm run dev` running, `npm run verify:decline` checks the API response, refreshed inbox, recommendation exclusion, persisted `group_likes` decision, and duplicate-decline handling. It really declines a request, so run `npm run db:reset` afterwards to restore the demo data.

Run `npm run db:reset` to put the two requests back for the next demo (check with the team first, because it resets the shared database).

You can also check the slice automatically. With `npm run dev` running, run `npm run verify:slice`. It accepts a request as Avery, checks the API response, refetches like a browser refresh would, checks the database rows, and prints `PASS`/`FAIL` for each step. It really accepts a request, so coordinate with the team before running it on the shared database.

## Live Chat Updates

When the other group sends a message, it shows up in your open chat within about 5 seconds, with no reload.

- **Only new messages.** An open chat calls `GET /api/chats/:id/messages?after=<last message id>` every ~5 seconds (`after=0` for a chat with no messages yet). The server returns only messages newer than the last one on screen, oldest first, and marks the chat read only when something new came back.
- **Background tabs pause.** Polling stops while the tab is hidden and catches up as soon as you come back.
- **The chat list keeps up.** On phone and desktop the list refreshes on the same schedule, so a chat with a new message moves to the top with the newest preview and unread count. On desktop, the chat that's open in the right pane doesn't show an unread badge.
- **No jumping while you read.** If you've scrolled up, new messages don't pull you down; a **New messages** button appears instead. Screen readers announce incoming messages and who sent them.

Supabase Realtime could replace the polling later; for now polling keeps the server on plain `pg` with no extra setup.

**Try it by hand with two windows:**
1. In a normal browser window, sign in as **Avery Hansen** (Tuesday Crew) and open the chat **Tuesday Crew + Sunday Summit Club**.
2. In a private window (it keeps its own session), sign in as **Maya Patel** (`maya@example.com`) and open the same chat.
3. Send a message as Maya. Within about 5 seconds it appears in Avery's window. Reply as Avery and watch it arrive in Maya's.
4. In Avery's window, go back to Messages (on desktop the list is already next to the chat) and **Accept** one of the requests in the purple box, so a newer chat sits on top. Then send another message as Maya. Within about 5 seconds, Tuesday Crew + Sunday Summit Club moves back to the top of Avery's list with Maya's message as the preview.

Run `npm run db:reset` afterwards to put the requests back (check with the team first, because it resets the shared database).

You can also check it automatically. With `npm run dev` running, run `npm run verify:chat`. It posts a message as a member of the other group in Avery's least recently active chat (Tuesday Crew + Sunday Summit Club on the seed data), polls with `?after=` the way an open chat does, checks that the chat moves to the top of the list with the new preview, checks the database rows, and prints `PASS`/`FAIL` for each step. On a fresh seed Avery has only that one chat, so there's no re-sort to see until you Accept a request (or run `npm run verify:slice`) first. It really posts a message, which stays as that chat's newest preview, and it marks the chat read, which clears the seeded unread badge. Coordinate with the team before running it on the shared database; `npm run db:reset` restores the demo data.

## Connect and Pass on Find

In two rounds of user testing, people found swiping confusing and thought Connect meant joining the other group. Find now makes it clear:

- **Labeled buttons.** Every card has **Pass** and **Connect** buttons. Screen readers hear the group's name too ("Connect with Film Fridays").
- **Swipe as a shortcut.** On touch screens, swipe a card right to connect or left to pass. A "Connect" or "Pass" stamp appears once you've dragged far enough, and a short or mostly vertical drag does nothing, so scrolling still works. Mouse drags are ignored, so text on desktop stays selectable.
- **Who you're choosing for.** A note above the card says "You're choosing for *your group*. Connect means your group wants to meet theirs, not that you join it." After a Connect, the toast says "Sent for *your group*!"
- **First-time explainer.** The first time someone opens Find, a **How Find works** sheet opens: "Like a dating app, but for friend groups", plus what Connect, a match and Pass mean. **Got it** closes it for good on that browser (saved in `localStorage` as `aura.findExplainerSeen`), and the **How it works** link reopens it anytime.

Lighthouse Accessibility on Find is 100 on phone and desktop, with the explainer open and closed.

**Try it by hand.** Open the app in a private window and sign in: the explainer opens on Find. Close it, reload, and it stays closed. On a phone (or Chrome DevTools' device mode), drag the card sideways.

### Your Own Groups

People can be in more than one friend group, so aura makes sure no one is ever offered a match with their own group:

- **Find** never recommends a group you're in.
- **Groups that liked you** hides a request that came from another group you're in. For example, if Avery is in Tuesday Crew and Wednesday Volleyball and someone in Wednesday Volleyball likes Tuesday Crew, Avery doesn't see that request. Tuesday Crew members who aren't in Wednesday Volleyball still see it and can accept or decline.
- **Accepting or connecting anyway** (for example from an old screen) is rejected with `400 OWN_GROUP`.

With `npm run dev` running, `npm run verify:own-groups` checks all of this. If it has to add a test request, it removes it again, so the data is left as it was.

## Read Receipts

Under an open chat's messages, small avatars show who has read how far, the way Messenger does.

- **Avatars under the last message each person has read.** Up to five show, then `+N`; hover to see every name. You don't see your own, and nobody's avatar sits under a message they sent themselves.
- **"Delivered" under your latest message** until someone else reads it. Then their avatar replaces it.
- **Stays current.** Receipts come from `chat_participants.last_read_at`, returned as `reads` by `GET /api/chats/:id/messages` when a chat opens and on every ~5 second poll, so they update without a reload. There's no new table or column.
- **Honest for new members.** `last_read_at` starts equal to `joined_at`, and that counts as not having opened the chat, so someone who just joined a group doesn't appear to have read the older messages.
- **Screen readers.** Each receipt reads "Read by Maya, Theo" when you move through the messages. Receipts aren't announced as they change; only new messages are.

**Try it by hand with two windows:**
1. In a normal window, sign in as **Avery Hansen** and open **Tuesday Crew + Sunday Summit Club**. Send a message: it says **Delivered**.
2. In a private window, sign in as **Maya Patel** and open the same chat.
3. Within about 5 seconds, Avery's **Delivered** becomes Maya's avatar.

You can also check it automatically. With `npm run dev` running, run `npm run verify:receipts`. It posts a real message as Avery and marks the chat read for Avery and for someone in the other group, so coordinate with the team before running it on the shared database. `npm run db:reset` restores the demo data, again only if the team agrees.

## Typing Indicator

While someone types in a chat, the other members see "Avery is typing…" with three bouncing dots at the bottom of the conversation.

- **Shows up within a few seconds.** While you type, your message box pings `POST /api/chats/:id/typing` at most once a second, which stores the time in `chat_participants.typing_at`. The open chat's regular poll returns `typing` (who, and how long until it runs out), so the others see you on their next poll, within about 5 seconds.
- **Goes away about 5 seconds after you stop.** The server counts someone as typing for 5 seconds after their last ping, and each browser counts that down itself, so it clears between polls too. Sending the message, clearing the box (`DELETE /api/chats/:id/typing`) or leaving the chat clears it straight away.
- **Doesn't flicker.** While someone in the chat is typing, the open chat polls every 2 seconds instead of 5, so a fresh ping always arrives before the last one runs out. It goes back to every 5 seconds when nobody is typing.
- **Several people.** "Avery and Maya are typing…", then "Avery, Maya and Theo are typing…", then "Avery, Maya and 2 others are typing…". You never see yourself.
- **Screen readers and reduced motion.** The same sentence is a `role="status"` message outside the message log, so it's announced politely without being read out as a chat message. With reduced motion turned on, the dots stand still.

**Try it by hand with two windows:** sign in as **Avery Hansen** in one window and **Maya Patel** in a private window, and open **Tuesday Crew + Sunday Summit Club** in both. Start typing as Maya: within about 5 seconds Avery sees "Maya is typing…". Stop typing and it disappears about 5 seconds later; send the message instead and it's replaced by the message.

The shared database needs the new column first: run `npm run db:migrate` (it runs `db/migrations/004_typing_indicator.sql`, which only adds the column) before the API that uses it is deployed. `npm run verify:typing` checks it end to end; it posts one real message, so coordinate with the team before running it on the shared database.

## Message Validation

The server checks every message before saving it (`readMessage` in `server/src/lib/validate.js`), so a bad message can't get into the database even when it skips the app, for example from a script or a pasted request.

- **Cleaned before saving.** Spaces and newlines at the start and end are trimmed, Windows line endings become `\n`, and invisible control characters (such as `\u0000`, which Postgres can't store) are removed.
- **Rejected with `400 VALIDATION_ERROR`:** a missing body, anything that isn't text, a message with nothing visible in it (only spaces, newlines, zero-width spaces or control characters), and a message over 2000 characters. Length is counted the way Postgres counts it, so an emoji is one character. The error's `details` say which field failed (`body`), the limit, and for long messages the actual length.
- **Shown in the chat, not as a pop-up.** If a send fails, the reason appears right above the message box, the box gets a red outline, and what you typed stays there so you can fix it. Screen readers announce it (`role="alert"`, linked to the box with `aria-describedby`). It goes away as soon as you start typing.
- **Database backstop.** The `messages.body` check constraint still rejects blank or too-long text, and Postgres "can't store this character" errors are mapped to `400` instead of `500` for every field (`server/src/errors.js`).

**Check it automatically.** With `npm run dev` running, run `npm run verify:messages`. It sends empty, whitespace-only, zero-width-only, `\u0000`, too-long, missing and non-text messages, checks each gets `400 VALIDATION_ERROR`, confirms none of them saved a row, and checks that 2000 emoji aren't rejected for length. It saves nothing, so it's safe on the shared database. `npm run verify:messages -- --post` also sends two real messages and checks they're saved trimmed and cleaned; those stay in Avery's chat until the next `npm run db:reset`.

**Try it by hand.** Open a chat as Avery Hansen. In DevTools, remove the `maxlength` attribute from the message box, paste in more than 2000 characters and press Send. The message appears above the box ("Messages can be up to 2000 characters. This one is 2050."), and your text is still in the box.

## Friendly Error Messages

On Messages and in a chat, errors are written for people, not developers. Nobody sees "Request failed (500)" or "Is `npm run dev` running?".

- **One place for the wording.** `friendlyError(err)` in `client/src/friendlyError.js` turns an API error into plain text: a lost connection becomes "We can't reach aura right now…", a server error becomes "Something went wrong on our end…", and codes like `GROUP_FULL`, `CHAT_FULL`, `NOT_ACTIVE_GROUP` and `NOT_IN_CHAT` get their own explanations. The API's 400-range messages (like "Message can't be empty.") are already written for people, so they pass through. To change a message, edit that file.
- **Try again only when it can help.** `canRetry(err)` is true for a lost connection or a 5xx. Then a failed chat shows **Try again**, and a failed send shows **Try again** next to the error above the message box, which sends your typed text again. A 4xx (a bad message, a chat you've left) gets no retry button, because sending the same thing again won't work. "Couldn't load messages" already had **Try again**.

**Try it by hand.** In Chrome DevTools, open **Network** and set throttling to **Offline**. Type a message and press Send: "We can't reach aura right now…" appears above the box with **Try again**, and your text stays. Set throttling back to **No throttling** and click **Try again**: the message sends.

## Loading States

While a screen waits for the API, it shows something that moves instead of a static "Loading…".

- **Skeleton rows where we know the layout.** The chat list, the "Groups that liked you" box and the inside of a chat show gray placeholder rows (avatars, lines of text, message bubbles) with a soft shimmer. They use the same CSS classes as the real rows, so the page doesn't jump when the data arrives. The likes box shows as many placeholder rows as the group had requests last time, and none if it had none (one on the first visit).
- **Spinners everywhere else.** Starting the app, Find and the Invite friends list show a spinner with a label. Accept and Decline show a spinner inside the button you pressed until the server answers, and the button keeps its size.
- **Reduced motion.** When the device asks for less motion (for example **Reduce motion** on macOS or iOS), the shimmer and the spinners stand still. The `prefers-reduced-motion` rule in `client/src/styles.css` turns off every animation in the app.
- **Screen readers.** The area that's loading is marked `aria-busy="true"`, and a `role="status"` message such as "Loading chats…", "Opening chat…" or "Finding groups for Tuesday Crew…" is announced. The message goes in 0.3 seconds after the placeholder appears, because screen readers announce changes to a status message that's already on the page, not one that arrives with its text. Loads faster than that aren't announced.

The shared pieces are in `client/src/components/Loading.jsx`: `Skeleton`, `Spinner`, `Loader` (spinner and label) and `LoadingStatus`.

**Try it by hand:**
1. In Chrome DevTools, open the **Network** tab and set throttling to **Slow 4G**. Open Messages, then a chat: the skeletons show for a second or two before the real rows replace them.
2. For reduced motion, open DevTools **⋮ → More tools → Rendering** and set **Emulate CSS media feature prefers-reduced-motion** to `reduce`. The placeholders stay still.
3. With throttling still on, turn on VoiceOver (Cmd+F5 on a Mac) and open Messages. VoiceOver says "Loading chats".
