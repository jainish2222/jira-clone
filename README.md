# TaskLOL

**Serious tasks. Unserious reactions.**

A small, fast, shared Kanban board for a team of about six. It has three columns (To Do, In Progress, Done), live updates for everyone, and a meme reaction (with sound) every time a task changes status.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · dnd-kit · MongoDB (official driver) · Zod · React Hook Form · Vitest · Playwright
- **Hosting:** Vercel + MongoDB Atlas

---

## Contents

1. [Features](#features)
2. [Quick start (local)](#quick-start-local)
3. [Environment variables](#environment-variables)
4. [Managing team members](#managing-team-members)
5. [Meme reactions](#meme-reactions)
6. [Architecture](#architecture)
7. [API](#api)
8. [Testing](#testing)
9. [Deploying to Vercel + MongoDB Atlas](#deploying-to-vercel--mongodb-atlas)
10. [Security & access](#security--access)
11. [Reliability, monitoring, backups](#reliability-monitoring-backups)

---

## Features

- **Board**
  - Three columns with counts and drag-and-drop (mouse, touch long-press, and keyboard).
  - Reorder cards within a column; the order survives a refresh.
- **Tasks**
  - Title, description, priority, optional due date (shows when it's overdue), labels, assignee, and a readable key (`TASK-001`).
  - Side panel with edit, delete (with confirmation) and the task's history.
- **Team**
  - Each person has their own account. No sign-up; the admin creates accounts from a CLI.
  - Every task shows who created it and who last changed it.
  - Live updates over Server-Sent Events, with an activity feed and an unread dot.
- **Meme reactions**
  - Five transition categories, each with a video, still poster, sound and caption.
  - A board setting decides whether only the mover or everyone sees reactions.
  - Each person can mute the sound on their own device.
- **Safe concurrency**
  - Every task has a `version`. Stale updates get HTTP 409, and the UI reconciles with the server.
  - When two people drop cards in the same spot at the same time, both still get a consistent order.
  - Optimistic drags roll back with a clear message if saving fails.
- **Polish**
  - Light and dark themes; responsive down to phone width.
  - Respects reduced-motion settings; loading, empty, offline and database-down states.
  - Keyboard shortcuts: `/` focuses search, `n` opens a new task.

## Quick start (local)

Requirements: **Node.js 20.9+** and **Docker** (or any MongoDB *replica set*: transactions and change streams need one).

```bash
npm install
docker compose up -d                  # MongoDB 8 as a single-node replica set on :27017
cp .env.example .env.local            # then set SESSION_SECRET (see below)
npm run db:setup                      # create collections + indexes, verify replica set
npm run members -- add alice "Alice Example"   # prints a temporary password
npm run seed                          # optional demo tasks
npm run dev                           # http://localhost:3000
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> Already have Atlas? Skip Docker and put your Atlas connection string in `MONGODB_URI`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | MongoDB connection string (`mongodb://` or `mongodb+srv://`). Must be a replica set. |
| `MONGODB_DB` | | `tasklol` | Database name. |
| `SESSION_SECRET` | ✅ | — | ≥ 32 random characters. Signs session cookies. Changing it signs everyone out. |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | | `5000` | How long to wait for the database before answering 503. |
| `MONGODB_MAX_POOL_SIZE` | | `20` | Connection pool size per server instance. |
| `SSE_MAX_STREAM_MS` | | `270000` | Lifetime of one live-update stream. Keep it below the host's function limit. |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | | `20` | Sign-in attempts per IP per minute. |

These are server-only. Nothing database-related ever reaches the browser. If a required variable is missing, the app shows a friendly "not configured" page and the API answers `503 SERVICE_NOT_CONFIGURED`. The details are logged on the server.

## Managing team members

There's no sign-up page: the admin manages accounts with a small CLI. It reads `.env.local`, or set `MONGODB_URI` and `SESSION_SECRET` in the shell to manage production.

```bash
npm run members -- list
npm run members -- add bob "Bob Ray"                 # random temporary password, printed once
npm run members -- add carol "Carol Ng" --password "a-long-password"
npm run members -- set-password bob                  # reset; signs Bob out everywhere
npm run members -- deactivate bob                    # blocks sign-in, ends sessions, keeps history
npm run members -- activate bob
```

Passwords need at least 10 characters. For a local demo you can opt out with `--allow-weak-password`, for example `npm run members -- add prince "Prince" --password 1234 --allow-weak-password`. Never do that on a board reachable from the internet.

People can change their own password from the account menu. Doing so signs out their other devices.

## Meme reactions

Two packs ship with the app. Choose one with `ACTIVE_PACK` in [`src/config/reactions.ts`](src/config/reactions.ts).

**`india` (default):**

| Transition | Caption | Meme (with sound) |
|---|---|---|
| To Do → In Progress | "Abhi maza aayega na bhidu!" | Johnny Lever |
| In Progress → Done | "7 crore! Absolute legend." | Amitabh Bachchan, KBC |
| Done → In Progress | "Ye dukh kahe khatam nahi hota?" | Vicky Kaushal, *Masaan* (with *Bhare Naina*) |
| In Progress → To Do | "Moye moye." | *Moye moye* |
| Any other change | "Kuch toh gadbad hai!" | ACP Pradyuman, *CID* |
| **Last open task → Done** (board cleared) | "Jalwa hai hamara! Board clear." | Munna Bhaiya, *Mirzapur* |

While every task is done, the empty To Do column shows Gaitonde's *"Apun hi bhagwan hai"* (*Sacred Games*), and In Progress says *"Kuch kaam nahi bacha. Chai peelo."* The board-cleared reaction is decided on the server, so every teammate sees the same celebration.

**`classic`:** a screaming cat, the *Yippee* creature, the confused math lady, SpongeBob panic, and The Office's *Everybody stay calm!*

**Swapping memes:** drop files into `public/memes/<pack>/` and edit the paths in [`src/config/reactions.ts`](src/config/reactions.ts). No other code changes are needed.

- **Media:** `.mp4` and `.webm` (video), or `.gif`, `.png`, `.jpg`, `.webp`. Short, small files work best (under 1 MB).
- **Poster:** a still image, shown for reduced motion or if the video fails.
- **Sound:** `.mp3`, `.ogg`, `.wav` or `.m4a`. Optional.
- **Validation:** only local `/memes/...` paths are accepted, so there are no external URLs and nothing executable. An invalid entry falls back to the caption with a small animation.

**Behaviour:**
- Reactions play only after the server has saved the change.
- One reaction shows at a time and closes itself after a few seconds. Close it early with ✕ or `Esc`.
- The card sits in a corner and never blocks the board.
- Each board event plays at most once. Reconnects and duplicate messages won't replay it.
- Video is always muted; sound is a separate audio track.
- If the browser blocks autoplay with sound, a **Tap for sound** button appears.
- Each person can mute sound under ⚙ → *Meme sound*. That setting is stored per device.
- Reduced motion shows the still poster instead of video.

> The bundled memes come from Tenor (GIFs) and MyInstants (sounds) and belong to their creators. They're included for private team fun. Replace them before using TaskLOL anywhere public or commercial.

## Architecture

```
src/
  app/                    pages, loading/error states, API route handlers
    api/tasks, api/tasks/[id], api/board, api/events (SSE), api/activity,
    api/settings, api/auth/{login,logout,password}, api/health
  proxy.ts                signed-cookie gate for pages & APIs (Next 16 "proxy", formerly middleware)
  components/
    board/                board, columns, cards, drag & drop, live updates, client state
    tasks/                create dialog, detail panel, delete confirmation, history
    reactions/            overlay, media fallback chain, provider (dedupe, one-at-a-time)
    activity/, account/, auth/, ui/ (shadcn)
  config/reactions.ts     the five memes
  lib/                    mongodb, env, errors, logger, auth (scrypt, sessions), validations (Zod),
                          tasks/ (transitions, task keys, due dates, ordering, filtering), api helpers
  services/               business logic: tasks, members, activity, settings, event hub
scripts/                  members CLI, db setup, demo seed, e2e server
tests/                    unit/, components/, integration/ (real MongoDB), e2e/ (Playwright)
```

### Data model (MongoDB)

| Collection | Fields | Indexes |
|---|---|---|
| `tasks` | `key`, `seq`, `title`, `description`, `status`, `priority`, `position`, `dueDate` (`"YYYY-MM-DD"`), `labels`, `assigneeId`, `createdBy`, `updatedBy`, `version`, `createdAt`, `updatedAt`, `completedAt`, `clientRequestId?` | `key` unique · `status+position` · `assigneeId+status` · `updatedAt` · `clientRequestId` unique (partial) |
| `members` | `username`, `name`, `passwordHash` (scrypt), `sessionVersion`, `active`, `failedLogins`, `lockedUntil` | `username` unique |
| `events` | `eventId`, `type`, `taskId`, `taskKey`, `taskTitle`, `actorId`, `at`, `changes`, `reaction`, `task` (snapshot), `settings` | `eventId` unique · `at` · `taskId+at` |
| `counters` | `task` sequence for keys; `column:<status>` locks | — |
| `settings` | `reactionVisibility` | — |

### Key decisions

- **One transaction per change.** A task write and its activity event commit together, so history and live updates can't drift from the data.
- **Optimistic concurrency.** `PATCH` and `DELETE` carry the `version` the client saw. If someone saved in between, the server answers **409** with the current task. The UI shows it and asks the user to re-apply their edit; nothing is silently overwritten.
- **Server-decided ordering.** Positions are fractional numbers. A move sends `{status, placement: {prevId, nextId}}`, and the server places the card from its neighbours' *current* positions.
  - A per-column lock document serializes simultaneous drops, so they never share a position.
  - When the gaps between positions run out, the column is renumbered.
- **Live updates.**
  - `GET /api/events` is a Server-Sent Events stream fed by one MongoDB change stream per server instance on the `events` collection.
  - Clients refetch the board on every (re)connect, so nothing is missed.
  - Incoming tasks apply only if their `version` is newer. Event ids drop duplicates.
  - A stream closes itself before Vercel's function time limit, and the browser reconnects with bounded, jittered backoff.
- **Idempotent creates.** Each "New task" dialog sends a `clientRequestId`. A double click or retry returns the original task instead of creating a second one.
- **Due dates are calendar days** (`YYYY-MM-DD`) with no time zone. "Overdue" is computed against each viewer's local date.

## API

Every response uses one envelope:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": { "code": "TASK_NOT_FOUND", "message": "The requested task was not found.", "details": { } } }
```

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` | `{username, password}` → sets the session cookie |
| `POST /api/auth/logout` | Clears the cookie |
| `POST /api/auth/password` | `{currentPassword, newPassword}`; signs out other sessions |
| `GET /api/board` | Tasks + members + settings (one round trip) |
| `GET /api/tasks?q=&priority=&status=&assignee=` | List / search / filter |
| `POST /api/tasks` | Create (`clientRequestId` optional; a replay returns 200 with the original task) |
| `GET /api/tasks/:id` | One task |
| `PATCH /api/tasks/:id` | `{version, ...fields, status?, placement?}` |
| `DELETE /api/tasks/:id?version=N` | Delete (409 if the task changed since version N) |
| `GET /api/activity?taskId=&limit=` | History (created / edited / assigned / status_changed / deleted) |
| `GET/PATCH /api/settings` | `{reactionVisibility: "self" \| "everyone"}` |
| `GET /api/events` | SSE stream: `ready`, `board`, `bye`, `reset` |
| `GET /api/health` | Public probe: `{"status":"ok"}` or 503 `{"status":"degraded"}` |

**Status codes:**

| Code | Meaning |
|---|---|
| 200 / 201 / 204 | Success |
| 400 | Malformed JSON or invalid id |
| 401 | No session or invalid session |
| 403 | Cross-site write blocked |
| 404 | Task not found |
| 405 | Unsupported method |
| 409 | Stale version |
| 413 | Body larger than 32 KB |
| 415 | Body isn't JSON |
| 422 | Field validation failed |
| 429 | Rate limited or account locked |
| 500 | Unexpected error (generic message; details only in server logs) |
| 503 | Database unavailable or service not configured (`Retry-After` set) |

## Testing

```bash
npm run lint && npm run typecheck
npm test                    # unit + component + integration (Vitest)
npm run test:integration    # real MongoDB replica set via mongodb-memory-server (downloads mongod once)
npm run test:e2e            # next build + Playwright (needs: npx playwright install chromium)
```

- **Unit:**
  - Validation, status-transition mapping, task keys, due dates and time zones, ordering, filtering.
  - Error formatting, password hashing, session signing, rate limiting.
  - Client reconciliation rules, reconnect backoff, and reaction config safety.
- **Component:**
  - The reaction overlay: caption, dismiss, Esc, one-at-a-time, dedupe, video → poster → caption fallback, reduced motion, blocked autoplay, muted sound.
  - Task cards: overdue display and empty sections.
- **Integration:** the real route handlers against a real replica set.
  - CRUD, search and filters, 400/404/409/413/415/422, idempotent creates.
  - Simultaneous updates and drops, column renumbering, history.
  - Auth, lockout, CSRF, session revocation.
  - SSE delivery, the database being down (503), missing config, and health checks.
- **End-to-end:** a production build in Chromium.
  - Sign-in, create, edit, delete with confirmation, search and filter.
  - Drag between columns with the right meme, persistence after refresh, no reaction on reorder.
  - Rollback when the network fails, keyboard-only moves.
  - Two users live at once, including a 409 for a stale write.

## Deploying to Vercel + MongoDB Atlas

### 1. MongoDB Atlas

1. Create a cluster. M0 (free) works for six people; **M10+ is recommended for production** because it includes continuous backups (see below).
2. **Database Access:** create a user with *readWrite* on the `tasklol` database only.
3. **Network Access:** Vercel's functions don't use fixed IPs. Either allow `0.0.0.0/0` (protected by the strong password and TLS), or use Vercel's Secure Compute / Atlas Private Endpoints on paid plans.
4. Copy the `mongodb+srv://` connection string.

### 2. Vercel

1. Import the repository into Vercel. The framework is detected as Next.js.
2. Add the environment variables (Production *and* Preview, with a different database for Preview):
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `SESSION_SECRET`
3. Under **Settings → Functions**, set the region next to your Atlas region (e.g. `iad1` ↔ AWS us-east-1). Keep Fluid compute enabled, which is the default.
4. Deploy. Then, from your machine with the production env vars set:
   ```bash
   MONGODB_URI=... SESSION_SECRET=... npm run db:setup
   MONGODB_URI=... SESSION_SECRET=... npm run members -- add alice "Alice Example"
   ```
5. Open the site, sign in, and share each person's temporary password privately.

`/api/events` declares `maxDuration = 300`. The stream closes itself at 270 s (`SSE_MAX_STREAM_MS`) and the browser reconnects seamlessly. If your plan allows a shorter maximum, lower `SSE_MAX_STREAM_MS` to match.

## Security & access

- **Every API route checks the session server-side.**
  - Valid HMAC signature.
  - Member still active.
  - `sessionVersion` unchanged, so a password reset or deactivation revokes sessions instantly.
- **Passwords** are hashed with scrypt (N=2¹⁵). Unknown usernames take the same time to reject as wrong passwords.
- **Brute-force protection:** accounts lock for 15 minutes after 5 failed attempts. Sign-in is also rate-limited per IP.
- **Cookies** are `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS.
- **Cross-site requests:** writes must be JSON and are refused with a foreign `Origin` header.
- **Never sent to clients:** the database, stack traces and raw errors. Logs redact secrets and connection strings.
- **Security headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Optional extra layer:** put the whole deployment behind **Vercel Deployment Protection** (Password Protection or Vercel Authentication), or behind **Cloudflare Access** on a custom domain. Then only your team can even reach the login page.
- **Rate limiting** is per server instance. It slows abuse, but it isn't access control; the session check is.

## Reliability, monitoring, backups

**Target: 99% monthly availability** (about 7 h 18 m of downtime per month allowed). That's an operational goal you measure, not something code can guarantee. Vercel and Atlas each publish higher SLAs on paid tiers.

What's built in:
- **Database handling**
  - Pooled MongoDB connections reused across requests, with server-selection, connect, socket and per-query timeouts.
  - Database outages return **503** with `Retry-After`, never a fake success. The UI shows "The database is temporarily unavailable" and keeps working read-only.
- **Client resilience**
  - Bounded, jittered retries for safe reads only.
  - SSE reconnects with capped backoff, plus a refetch after each reconnect. There's no polling.
- **Visibility**
  - Structured JSON logs (with redaction) and a request id on every error response.
  - `src/instrumentation.ts` has an `onRequestError` hook and a `setErrorReporter` hook for Sentry or similar.
  - `/api/health` for uptime monitors.

### Monitoring setup (15 minutes)

1. **Uptime:** point UptimeRobot, Better Stack or Checkly at `https://<your-domain>/api/health` every 1–5 minutes. Alert on non-200.
2. **Errors:** add Sentry (`@sentry/nextjs`) and register it in `src/instrumentation.ts` (see the comment there).
3. **Logs:** Vercel → Logs. Filter `level:"error"`. Add a log drain for retention if you need it.
4. **Atlas:** enable alerts for *Connections*, *Replication lag* and *Disk*.

### Backups & restore

- **Atlas M10+ (recommended):** turn on **Cloud Backup** with continuous backup / point-in-time restore. Restore from Atlas → *Backup* → *Restore*, preferably into a new cluster. Then point `MONGODB_URI` at it and redeploy.
- **Any tier:** nightly logical backup from a trusted machine or CI job:
  ```bash
  mongodump --uri "$MONGODB_URI" --db tasklol --archive=tasklol-$(date +%F).gz --gzip
  # restore (into an empty database):
  mongorestore --uri "$MONGODB_URI" --archive=tasklol-YYYY-MM-DD.gz --gzip --nsInclude 'tasklol.*'
  ```
  Keep about 14 daily archives off-site. **Test a restore every quarter:** restore into a scratch database, set `MONGODB_DB` to it locally, and open the board.

### Deployment checklist

- [ ] `npm run lint && npm run typecheck && npm test && npm run test:e2e` pass
- [ ] Production env vars set: `MONGODB_URI` (replica set / Atlas), `MONGODB_DB`, `SESSION_SECRET` (≥ 32 random chars, unique per environment)
- [ ] Preview deployments use a **separate** database
- [ ] `npm run db:setup` run against production (indexes, replica-set check)
- [ ] Team members created; temporary passwords shared privately
- [ ] Vercel function region matches the Atlas region
- [ ] Atlas user has least privilege (readWrite on one database)
- [ ] Backups enabled and a restore tested
- [ ] Uptime monitor on `/api/health` with alerts
- [ ] Error tracking connected (optional but recommended)
- [ ] (Optional) Deployment Protection / Cloudflare Access enabled
- [ ] Meme files replaced if the board will be public
