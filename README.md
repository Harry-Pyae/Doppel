# Vote Out the Imposter

A PolyHydra Free-To-Play party game for one room of phones. Everyone joins a room on
their own phone. When the host starts a round, everyone gets the same character except
one random player, the **imposter**, who gets a different but related character and an
"Imposter" label. Each phone shows only its own card, and only while it is held down.
Clues, discussion and the vote all happen out loud, in person.

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and Supabase (the shared
PolyHydra project). Everything runs on free tiers: Vercel Hobby and Supabase Free.

```
src/server/auth.ts        sign-in: the one module the PolyHydra hand-off will replace
src/server/supabase.ts    server-side Supabase clients (the only place the service-role key is used)
src/components/useRoom.ts the phone's view of its room: heartbeat, Realtime ping, reconnect
src/components/*.tsx      screens: main menu, game room, round (the hold-to-reveal card)
src/lib/i18n.ts           English and Burmese text (Burmese is a draft, see "Owner steps")
supabase/migrations/      the imposter schema: tables, RLS and every state-changing function
data/                     characters.json and pairs.json (editable)
tests/db/                 RLS privacy and room-rule tests on a real Postgres (PGlite, no Docker)
tests/e2e/                Playwright, four browser contexts, against a local Supabase
```

## Local development

Needs Node 24 and, for the end-to-end tests only, Docker.

```sh
npm install
npx supabase start            # local Supabase in Docker: applies the migration and supabase/seed.sql
npx supabase status -o env    # copy API_URL, ANON_KEY and SERVICE_ROLE_KEY into .env.local (see below)
npm run data:sync             # copies data/pairs.json into the database
npm run dev                   # http://localhost:3000
```

`supabase/seed.sql` creates a **local-only** copy of the shared PolyHydra tables this game reads
(`public.profiles`, `public.login_locks`, `public.login_fail`). It never runs on the shared project.
To sign in locally, make an account in the local stack (Supabase Studio, or the way
`tests/e2e/setup.ts` does) with an approved `public.profiles` row.

Checks:

```sh
npm run lint
npm run typecheck
npm test              # unit tests, the RLS privacy tests and the room rules (PGlite, no Docker)
npm run data:check
npm run e2e           # Playwright; needs `npx supabase start` (it refuses any non-local Supabase)
npm run check         # lint + typecheck + test + data:check
```

## Supabase setup (the shared PolyHydra project)

The game keeps everything in its own schema, `imposter` (rooms, members, assignments,
recent pairs and pairs), with RLS on every table. It only **reads** the shared
`public.profiles` table and uses the shared sign-in lock (`public.login_locks`, `public.login_fail`).
It never creates, changes or approves accounts.

1. **Run the migration.** In the Supabase dashboard → SQL Editor, paste and run
   `supabase/migrations/20261102000001_imposter.sql` once. (Don't use `supabase db push` here:
   the shared project's migration history belongs to The Gilded Delve's repository.)
   It also enables the `pg_cron` extension (available on the Free plan) and schedules an hourly
   job, `imposter-cleanup`, that deletes rooms idle for 6 hours or more. Check it afterwards with
   `select jobname, schedule from cron.job;`. Rooms are also swept whenever someone creates or joins one.
2. **Expose the schema.** Dashboard → Project Settings → Data API → **Exposed schemas**: add
   `imposter` and save. The migration already grants exactly what is needed; you don't need
   Supabase's "grant all" snippet (and RLS holds even if someone runs it; a test proves this).
3. **Realtime.** The game sends an empty "changed" ping on a public channel per room
   (`room:<uuid>`); phones then fetch their own state. Keep Realtime → Settings →
   "Allow public access" on (the default).
4. **Fill the pairs.** With `.env.local` pointing at the shared project: `npm run data:sync`.
   Run it again after every change to `data/pairs.json`.

## Environment variables

| Name | Where | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | the anon (publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | the service_role key: sign-in username lookup, the login lock, `npm run data:sync`. Never prefix it with `NEXT_PUBLIC_`; a test checks that only `src/server/supabase.ts` reads it. |

`.env.example` lists them; copy it to `.env.local` (never committed).

## Vercel deployment

1. Push this repository to GitHub and import it in Vercel as its own project (framework: Next.js;
   Node.js 24 in Settings → General).
2. Add the three environment variables above to Production and Preview.
3. Deploy. Every push to `main` redeploys.

## Characters and images

- `data/characters.json`: `{ "id", "name", "category", "image" }`. `id` is lower-case letters,
  digits and dashes; `category` is free text (actor, musician, artist, superhero, anime…);
  `image` is `"<id>.webp"` (or `null`).
- `data/pairs.json`: related pairs by character id, e.g. `["taylor-swift", "ariana-grande"]`.
  A character may be in several pairs. Each round picks a pair, then randomly decides which side
  the majority gets; the other side goes to the imposter.
- **Images:** drop `public/characters/<id>.webp` (square, 512 × 512) into the folder and redeploy
  (or restart `npm run dev`). Until a file is there, the card shows the matte placeholder:
  a silhouette with the character's initial.
- After any change: `npm run data:check` (unique ids, every pair points to real characters,
  each image exists or uses the placeholder), then `npm run data:sync` if `pairs.json` changed.

## Sign-in and the PolyHydra hand-off

Today `/sign-in` takes a username and password and follows the shared PolyHydra rules
(as in The Gilded Delve): the server finds the account by username (ignoring case); unknown
names and wrong passwords get the same answer after the same one-second wait; 5 wrong passwords
lock that name for 15 minutes; admin accounts are refused; only **approved, not-banned**
accounts get a session. There is no sign-up: accounts come only through admin invites.

The status is read again from `public.profiles` on every request: by the page on load, and by
every database function (`imposter.player()`), so a ban takes effect on the next tap.

**Later: the hub hand-off.** The PolyHydra hub will send a single-use, 60-second code by
form POST, and this game's server exchanges it for a session. To switch:

1. In `src/server/auth.ts`, replace `signIn()` with the code exchange (keep `currentPlayer()`,
   `allowed()` and `signOut()`; they stay the same).
2. Replace `src/app/api/sign-in/route.ts` with a POST handler that reads the form field, calls the
   exchange and redirects to `/`. Point `/sign-in` (or a "Sign in through PolyHydra" link) at the hub.
3. Add the hub's origin to `form-action` in `next.config.ts`'s Content-Security-Policy.

Nothing else in the game depends on how the session was made.

## Rules the code enforces

All of these live in the database functions, which lock the room row first, so two taps
at once can't break a room (`tests/db/rules.test.ts` covers each):

- Room codes: 6 characters with no 0, O, 1 or I; typing ignores case and spaces.
- 3 to 12 players; only the host can remove, start, restart and end.
- Joining during a round queues you ("Round in progress, you'll join next round"); Restart adds you.
- Removed players can't rejoin that room (checked by account).
- One room at a time per account; creating or joining another leaves the first.
- A host away for 3 minutes (in the game room or a round) hands the role to the longest-connected
  player ("<name> is now the host"); a host who leaves hands it over at once. Phones keep their
  screen on in the game room and during rounds (Wake Lock API, where supported), so a phone left
  on the table doesn't count as away. A tab in the background does (the dot turns to "away"
  after about 25 seconds without a heartbeat).
- Leave room asks first ("Leave this room?"); Remove, Restart and End ask too.
- Each round: a random pair, a random majority side, a random imposter, avoiding the room's
  last 5 pairs (with 5 pairs or fewer, as many recent ones as possible while one is left).
- Rooms are deleted when ended, or once idle for 6 hours or more (hourly `pg_cron` job, and on
  every create or join).

## Privacy

- Cards live in `imposter.assignments`, written only by `imposter.start_round()`. RLS lets each
  player read only their own row; anon reads nothing.
- Rooms, members and pairs are not readable directly at all; the player list comes from
  `imposter.my_state()`, which returns names, host and connection only, plus the caller's own card.
- Realtime carries only an empty "changed" ping.
- `tests/db/privacy.test.ts` proves a player can't read another player's assignment (as a player
  or as anon, even with every table granted); the round e2e test records every API response and
  Realtime frame on each phone and checks none contains the other side's character.
- The service-role key stays on the server.

## Owner steps

1. Run the migration on the shared project (it also schedules the hourly `pg_cron` sweep; check
   `cron.job`), expose `imposter`, and run `npm run data:sync` (see "Supabase setup").
2. Create the private GitHub repo and push, then create the Vercel project and add the three
   environment variables.
3. Review the Burmese text in `src/lib/i18n.ts` (every line is a draft).
4. Replace or extend the seed characters and pairs; add images when you have them.
5. Add the game to the PolyHydra hub (`src/lib/games.ts` there) with its `playUrl`.
