# SignalBox — Project Handbook

## 1. Overview

SignalBox is a real-time notification delivery platform: any authenticated user can send a notification to a specific user, to everyone subscribed to a topic, or to all users — delivered instantly over Socket.IO to whoever is online, persisted in MongoDB so it's still there when they next log in, optionally emailed, and tracked in Redis for delivery-status lookups.

### Feature set
- Email/password auth (JWT)
- **Targeted delivery**: send to one user, to a topic's subscribers, or broadcast to everyone
- **Topic subscriptions**: users opt into topics (`orders`, `alerts`, `marketing`, `system`, or any custom topic) from a preferences page
- **Notification center**: a bell icon with unread badge and dropdown preview, plus a full Inbox page with All/Unread filters and "mark all read"
- **Live popups**: an incoming notification pops up as a toast-style card the instant it's pushed, in addition to landing in the inbox
- **Multi-channel delivery**: in-app (always) plus an optional email channel (real SMTP if configured, or a safe console-log fallback for local/demo use)
- **Delivery tracking**: recipient count / live-delivered count per send, queryable via a Redis-backed endpoint
- A **sender dashboard** (the "Send" page) — any signed-in user can compose and send; a real product would gate this behind an admin role, noted below
- Dockerized for deployment (Node + MongoDB + Redis + nginx-served client)

This project intentionally uses a **different visual theme** from the other two rebuilt projects in this repo (MeetFlow, SyncBoard): a light background, amber accent, "Plus Jakarta Sans" typeface, and a sidebar-dashboard layout rather than a dark centered-hero design.

## 2. Architecture

```
┌─────────────┐   HTTPS/REST (auth, users, notifications)        ┌──────────────┐
│   Browser A │ ────────────────────────────────────────────────▶│   Express    │
│  (React app)│ ◀───────────────── Socket.IO (live push) ────────│  + Socket.IO │
└─────────────┘                                                   └──────┬───────┘
                                                                          │
                                                       ┌──────────────────┼──────────────────┐
                                                       ▼                  ▼                  ▼
                                                ┌─────────────┐   ┌─────────────┐   ┌────────────────┐
                                                │  MongoDB    │   │    Redis    │   │  SMTP / console  │
                                                │ users,      │   │  delivery   │   │  email transport │
                                                │ notifications│  │  status     │   │                  │
                                                └─────────────┘   └─────────────┘   └────────────────┘
```

- **MongoDB** is the durable store: `User` (credentials, subscribed topics, email preference) and `Notification` (one document *per recipient*, so history/unread-state is per-user and simple to query — see §3).
- **Redis** is used exactly where it earns its place: transient delivery-status counters (`delivery:<notificationId>` → recipient/delivered counts, expiring after 7 days). It is not used as the source of truth for notification content or history — that would make "did I already read this" and "list my notifications" needlessly complicated across a moving TTL window.
- **server/src/lib/dispatch.js** is the one place that fans a send out: resolves recipients (one user / topic subscribers / everyone), persists a `Notification` row per recipient, pushes live to each recipient's own Socket.IO room (`user:<id>`) if connected, fires off email for opted-in recipients, and records the Redis delivery summary.
- **server/src/sockets/presence.js** is a simple in-memory online-socket registry (per recipient's userId → set of socket ids). It's what `dispatch.js` checks to decide whether a send was "delivered live" or only persisted for later.

## 3. Why one Notification document per recipient

A topic or broadcast send doesn't create one shared "message" row referenced by many users — it inserts a separate `Notification` document per recipient at send time (all sharing the same `notificationId` for correlation/delivery-tracking, but each with its own MongoDB `_id`). This trades some storage duplication for making the hard parts trivial:

- "My inbox" is just `Notification.find({ recipientId: me })` — no joins, no separate read-receipts table.
- "Mark as read" only ever touches *my* copy — no risk of one user's read state leaking into another's.
- An offline subscriber still gets their copy waiting for them next login, with no separate "pending notifications queue" to reconcile.

## 4. Real-time delivery flow

1. Sender submits the Send form → `POST /api/notifications/send`.
2. The route resolves recipients (`User.findById` / `User.find({ topics: topic })` / `User.find({})`) and calls `dispatchNotification`.
3. `dispatchNotification` bulk-inserts one `Notification` per recipient, then — per recipient — emits a `notification` socket event into that user's own `user:<id>` room (nobody has to be "listening on the topic room"; each recipient's dedicated room already covers every reason they might receive something).
4. Any client connected as that user (having called `authenticate` with their JWT over the socket) receives it immediately: bell badge increments, a popup card renders, and the Inbox list gets it prepended — no page refresh needed.
5. If the `email` channel was requested and the recipient has `emailNotifications` on, an email is sent (or logged to the console if no SMTP is configured) — this happens independent of whether they were online.
6. The sender's UI shows `{recipientCount, deliveredCount}` from the response so they can see how many were reached live vs. only persisted.

## 5. Known limitations & scaling path

- **The sender dashboard has no separate admin role** — any authenticated user can send to any user or topic. Fine for a demo/portfolio build; a real product would add a `role` field to `User` and gate `/api/notifications/send` behind it.
- **Presence is per-process (in-memory `Map`)** — this only knows about sockets connected to the same server instance. Running multiple instances behind a load balancer would make `deliveredCount` inaccurate for users connected to a different instance (their `Notification` docs and email still work fine — they'd just also get it live via a normal client reconnect/poll, just not counted as "delivered live" by that particular request). Fix: the Socket.IO Redis adapter for cross-instance room broadcast, and a shared presence set in Redis instead of an in-process Map.
- **Broadcast-to-everyone doesn't paginate recipients** — `User.find({})` loads every user to fan out a broadcast. Fine at demo scale; a production system would batch this (cursor + bulk insert in chunks) once the user base is large.
- **Email is best-effort, fire-and-forget** — a failed send is logged server-side but doesn't fail the API response or get retried. A production system would want a retry queue (e.g. BullMQ) rather than an inline `.catch(console.error)`.
- **A crash class was found and fixed during testing**: an unvalidated `:id` route parameter reaching a Mongoose query threw a `CastError` that, because the async handler had no error boundary, crashed the entire Node process (not just the one request). Fixed with an `asyncHandler` wrapper on every async route (forwards rejections to Express's error middleware instead of letting them escape), a `mongoose.isValidObjectId()` check before using any `:id`/`:notificationId` param in a query, and a final Express error-handling middleware that returns a normal 400/500 response instead of taking the server down. The same class of bug was also present in the `acknowledge` socket handler and was fixed the same way.

## 6. Environment variables

**server/.env**
| Var | Purpose |
|---|---|
| `PORT` | server port (default 3004) |
| `MONGO_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string (delivery-status tracking) |
| `JWT_SECRET` | secret for signing auth tokens — must be long/random in production |
| `CLIENT_ORIGIN` | CORS allowed origin for the frontend |
| `NODE_ENV` | `production` enables serving the built client from `client/dist` |
| `DEFAULT_TOPICS` | comma-separated topics offered in the Topics page UI (users/senders can also use any custom topic name) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | optional real SMTP config; leave `SMTP_HOST` unset to use the console-log email transport |

**client/.env**
| Var | Purpose |
|---|---|
| `VITE_SERVER_URL` | Base URL of the API/signaling server (leave blank if served from the same origin, e.g. behind the nginx proxy in docker-compose) |

## 7. Local development

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
```

Start MongoDB and Redis (mapped to host ports 27019/6380 — deliberately distinct from the other two rebuilt projects in this repo, so all three can run side by side):

```bash
docker compose up -d mongo redis
```

Then, in two terminals:

```bash
npm run dev:server    # http://localhost:3004
npm run dev:client    # http://localhost:5175 (proxies /api & /socket.io)
```

MongoDB/Redis are optional for a quick smoke test: the server logs a warning and keeps running, but auth, persistence, and delivery tracking won't work without them.

## 8. Deployment

### Docker Compose (single host)
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
```
Brings up MongoDB, Redis, the API/signaling server, and an nginx-served client build. Exposes the app on port **8082**.

### Split hosting (e.g. Render + Vercel)
1. Deploy `server/` as a Node web service. Set `MONGO_URI` (e.g. MongoDB Atlas), `REDIS_URL` (e.g. Upstash/Redis Cloud), `JWT_SECRET`, `CLIENT_ORIGIN`, and SMTP credentials if you want real email delivery.
2. Deploy `client/` as a static site. Set `VITE_SERVER_URL` to the deployed server's URL at build time.

## 9. Project structure

```
server/
  src/
    config/db.js, redis.js     MongoDB + Redis connections
    lib/dispatch.js            recipient resolution + fan-out + persistence + live push + email + delivery tracking
    lib/mailer.js               nodemailer wrapper with a console-log fallback transport
    models/                     User, Notification
    middleware/auth.js          JWT sign/verify (HTTP + socket), requireAuth
    middleware/asyncHandler.js  wraps async routes so rejections can't crash the process
    routes/                     auth.js, users.js, notifications.js
    sockets/presence.js         in-memory online-socket registry
    sockets/index.js            authenticate / acknowledge socket events
    index.js                    app entrypoint + global error-handling middleware
client/
  src/
    hooks/useNotifications.js   socket connection, live popups, unread count, mark read/all-read
    context/AuthContext.jsx
    context/ToastContext.jsx
    lib/api.js                  REST client
    components/                 Sidebar, AppShell, NotificationBell, NotificationPopupStack, notificationMeta
    pages/                      Auth, Inbox, Send, Topics
    index.css                   light/amber design system (distinct from the other two projects)
```

## 10. Manual test checklist

- [ ] Register two users; confirm each only sees their own inbox
- [ ] User A sends a direct notification to User B → B's bell badge increments and a live popup appears within a second, with no page refresh
- [ ] Mark a notification read from the Inbox and from the bell dropdown — badge count decreases correctly in both places
- [ ] "Mark all read" clears the badge and every row's unread state
- [ ] User B subscribes to a topic on the Topics page; User A sends to that topic → only subscribed users receive it, with the correct `recipientCount`
- [ ] Enable the Email channel on a send → the server console logs the email (or it's actually delivered, if SMTP is configured) only to recipients who have `emailNotifications` on
- [ ] Send while the recipient is offline → notification appears in their Inbox next time they log in (not lost)
- [ ] `GET /api/notifications/delivery/:notificationId` (or check Redis directly) returns the correct recipient/delivered counts after a send
- [ ] Restart the server → previously sent notifications and topic subscriptions are still there (MongoDB persistence, not just in-memory)
- [ ] Sending to a malformed/garbage user id, or marking a bogus notification id as read, returns a clean 400/404 — the server process itself never crashes
