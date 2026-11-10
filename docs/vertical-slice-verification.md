# Sprint 2 vertical-slice verification tracker

Use this tracker against the deployed fork after each release. A slice is complete only when the UI action, API response, and database result all agree. Record the date, tester, environment, and evidence link in the final column.

| # | Slice | UI action | API / expected result | Database evidence | Result / evidence |
|---:|---|---|---|---|---|
| 1 | Individual onboarding profile | Create an account and read the first setup screen | Profile setup copy says the profile is about the individual; `PATCH /api/me` returns the updated profile | `users` contains the personal fields | ☐ |
| 2 | Profile completion gate | Finish bio, photo, interest, age, gender, relationship, and personality fields | Incomplete profile returns `403 PROFILE_INCOMPLETE`; complete profile proceeds to group setup | `users`, `user_photos`, `user_interests` are populated | ☐ |
| 3 | Create a group | Create a group from onboarding | `POST /api/groups` returns `201` and an invite code | `friend_groups` and `group_memberships` contain the owner | ☐ |
| 4 | Invite link sharing | Open Profile → Invite friends → Copy link | Clipboard contains `#/join?code=...`; copied link opens the join flow | Link code matches the group’s stored `invite_code` | ☐ |
| 5 | Join flow | Open the invite link while signed out, sign in, then submit | Auth redirects back to the prefilled join screen; `POST /api/groups/join` returns `201` | New `group_memberships` row and active group are present | ☐ |
| 6 | Group cap security | Attempt to join an 11th member | API returns `409 GROUP_FULL` and the UI shows the error | Membership count remains 10 | ☐ |
| 7 | Find location | Open Find and inspect a recommendation card | Card shows the city in the location chip and “Located in …” text | Recommendation payload includes `city` | ☐ |
| 8 | Find member profile | Tap a member on a recommendation card | `GET /api/groups/:groupId/members/:userId/profile` returns profile data and a sheet opens | Response is limited to the selected member’s profile rows | ☐ |
| 9 | Remove group status | Create and edit a group | No Status field is shown; group create/update ignores status input | `friend_groups` has no `status_text` column after migration | ☐ |
| 10 | Find decision | Tap Connect or Pass | `POST /api/groups/:id/likes` returns `201`; the next card appears | `group_likes` records the decision | ☐ |
| 11 | Reciprocal match | Have the other group connect back | Match response includes a chat; both groups see the conversation | `group_matches`, `chats`, and `chat_participants` are created | ☐ |
| 12 | Group chat | Send a message from the new match | Message appears locally and on the other group’s refresh | `messages` contains the message with the correct sender | ☐ |

## Automated checks

- `npm run build`
- `npm run verify:slice` with the configured database
- `npm run verify:own-groups` with the configured database
- `npm run db:check` after applying migrations
