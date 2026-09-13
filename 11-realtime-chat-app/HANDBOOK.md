# Wisp — Project Handbook

## 1. Overview

Wisp is a real-time chat application in the WhatsApp/Slack mold: public rooms and private 1:1 direct messages, both backed by MongoDB so history survives restarts, with live presence, typing indicators, read receipts, and file/image sharing.

### Feature set
- Email/password auth (JWT)
- **Public rooms** — create or join by name, open to any authenticated user
- **Direct messages** — 1:1 private conversations, one canonical room per user pair
- **Persistent history** — messages are stored in MongoDB and paginated on load, not just held in memory
- **Live presence** — online/offline status and "last seen" per user, updated in real time across every open tab
- **Typing indicators** — per-room, auto-expiring
- **Read receipts** — single check (sent) → double check (read by the other person), updated live
- **File/image sharing** — upload via a REST endpoint, referenced in a chat message; images render inline, other files as a download link
- Dockerized for deployment (Node + MongoDB + nginx-served client)

This is the third rebuilt project in this repo and deliberately uses a **third distinct visual theme**: dark slate + teal/emerald ("Outfit" typeface), a WhatsApp-style three-pane layout (sidebar → conversation → composer) — different from both the indigo dashboard apps and the light amber one.

## 2. Architecture

```
┌─────────────┐   HTTPS/REST (auth, rooms, messages, upload)     ┌──────────────┐
│   Browser A │ ───────────────────────────────────────────────▶│   Express    │
│  (React app)│ ◀──────────────── Socket.IO (live chat) ─────────│  + Socket.IO │
└─────────────┘                                                   └──────┬───────┘
                                                                          │ MongoDB
                                                                          ▼
                                                                   ┌──────────────┐
                                                                   │ users, rooms,│
                                                                   │  messages     │
                                                                   └──────────────┘
```

- A **Room** document is either `type: "public"` (has a `name`, anyone can join) or `type: "dm"` (has exactly two `members`; server-side access control in `lib/roomAccess.js` enforces that only those two members can read or post to it — public rooms are open to any authenticated user).
- **One DM room per user pair**: `POST /api/rooms/dms/:userId` looks up an existing room by the sorted pair of member ids before creating a new one, so re-opening a DM with the same person always resolves to the same room and its history.
- **Messages** are persisted per-room with a `readBy` array; a message starts with the sender already in `readBy`, and the client auto-emits `mark_read` for any incoming message from someone else the moment it renders in the currently-open room.
- **Presence** is a simple in-memory `Map` (`sockets/presence.js`) of userId → connected socket ids; going from zero sockets to one (or back to zero) is what triggers a `presence_update` broadcast and a `lastSeen` write.

## 3. Socket protocol

| Event (client→server) | Payload | Purpose |
|---|---|---|
| `authenticate` | `{ token }` | Verifies the JWT, joins the personal `user:<id>` room, marks the user online |
| `join_room` / `leave_room` | `{ roomId }` | Joins/leaves the Socket.IO room for a specific conversation (access-checked for DMs) |
| `send_message` | `{ roomId, text, attachment }` | Persists the message, then broadcasts `receive_message` to the room |
| `typing` / `stop_typing` | `{ roomId }` | Broadcasts `user_typing` / `user_stopped_typing` to the room |
| `mark_read` | `{ roomId, messageId }` | Adds the caller to that message's `readBy`, broadcasts `read_receipt` |

| Event (server→client) | Purpose |
|---|---|
| `presence_update` | `{ userId, online, lastSeen }` — any user's status changed |
| `receive_message` | A new message in a room you're joined to |
| `user_typing` / `user_stopped_typing` | Someone is/isn't typing in the active room |
| `read_receipt` | `{ roomId, messageId, userId }` — someone read a message |
| `room_error` | Tried to join/post to a room you don't have access to |

## 4. Bugs found and fixed during testing

Building this back-to-back with two prior rebuilds (MeetFlow, SyncBoard, SignalBox) surfaced two real issues worth documenting, both caught by actually exercising the app with two live browser sessions rather than just reading the code:

1. **`user.id` vs `user._id` mismatch.** The `/api/auth/me` response returns a Mongoose document shaped with `_id` (Mongo's native field) — there is no `.id` alias. The client's "is this message mine?" check (`Chat.jsx`) was written as `senderId === user?.id`, which is always `false` since `user.id` is `undefined`. The visible symptom: every message rendered as if it came from someone else, even your own. A second instance of the same class of bug existed between the DM-list endpoint (which shaped its response as `{ id: other._id, ... }`) and the user-picker endpoint (which returned raw `{ _id, ... }`) — starting a DM from one path vs. the other left `conversation.otherUser` in two different shapes, so the chat header's live "Online" status worked from one entry point and silently stayed stuck on stale "Last seen" text from the other. **Fix:** standardized on `_id` everywhere a user object crosses the API boundary, and fixed both client call sites.
2. **Room membership doesn't survive a socket reconnect.** Socket.IO room membership (`socket.join(...)`) is tied to the underlying connection — it does not persist across a dropped/reconnected socket (server restart, deploy, brief network blip). The client only emitted `join_room` when a user *selected* a conversation, never again afterward, so a reconnect while a conversation was already open left the user "in" the conversation from the UI's perspective but not actually receiving anything for it — verified by watching a typing-indicator test go silent immediately after an unrelated server restart. **Fix:** the client now re-emits `join_room` for whatever room is currently open every time it receives an `authenticated` ack — which fires on the very first connection and on every subsequent reconnect alike.

Both are the kind of bug that a code review alone tends to miss and only shows up when two real sessions are driven against a running server — which is why this project (like the other three) was tested live with two accounts rather than just built and shipped.

## 5. Known limitations

- **Public rooms have no membership/moderation model** — any authenticated user can post in any public room; there's no owner-only controls, kicking, or private (invite-only) rooms beyond DMs.
- **Presence is per-process** — an in-memory `Map`, so it only knows about sockets connected to the same server instance. Multi-instance deployment would need the Socket.IO Redis adapter plus a shared presence store, same as the other Socket.IO-based projects in this repo.
- **File uploads are stored on local disk** (`server/uploads/chat`) — fine for a single instance or with the Docker volume mount, but won't survive a redeploy on most ephemeral-filesystem PaaS hosts without switching to S3-compatible storage.
- **No message editing/deletion** — messages are append-only once sent.

## 6. Environment variables

**server/.env**
| Var | Purpose |
|---|---|
| `PORT` | server port (default 3001) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | secret for signing auth tokens — must be long/random in production |
| `CLIENT_ORIGIN` | CORS allowed origin for the frontend |
| `NODE_ENV` | `production` enables serving the built client from `client/dist` |

**client/.env**
| Var | Purpose |
|---|---|
| `VITE_SERVER_URL` | Base URL of the API/signaling server (leave blank if served from the same origin, e.g. behind the nginx proxy in docker-compose) |

## 7. Local development

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
```

Start MongoDB (mapped to host port **27020** — distinct from the other rebuilt projects' Mongo instances so all four can run side by side):

```bash
docker compose up -d mongo
```

Then, in two terminals from the project root:

```bash
npm run dev:server    # http://localhost:3001
npm run dev:client    # http://localhost:5176 (proxies /api, /uploads & /socket.io)
```

MongoDB is optional for a quick smoke test: the server logs a warning and keeps running, but auth and persistence won't work without it.

## 8. Deployment

### Docker Compose (single host)
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
```
Brings up MongoDB, the API/signaling server, and an nginx-served client build (nginx proxies `/api`, `/uploads`, and `/socket.io` to the server container). Exposes the app on port **8083**.

### Split hosting
1. Deploy `server/` as a Node web service. Set `MONGO_URI` (e.g. MongoDB Atlas), `JWT_SECRET`, `CLIENT_ORIGIN`. Mount a persistent volume at `server/uploads` or switch to S3-compatible storage if you need uploaded files to survive redeploys.
2. Deploy `client/` as a static site. Set `VITE_SERVER_URL` to the deployed server's URL at build time.

## 9. Project structure

```
server/
  src/
    config/db.js              MongoDB connection
    lib/roomAccess.js         public-vs-DM access control shared by REST and sockets
    models/                    User, Room, Message
    middleware/auth.js         JWT sign/verify (HTTP + socket), requireAuth
    middleware/asyncHandler.js wraps async routes so rejections can't crash the process
    routes/                    auth.js, users.js, rooms.js, messages.js, upload.js
    sockets/presence.js        in-memory online-socket registry
    sockets/index.js           join/send/typing/read-receipt socket events
    index.js                   app entrypoint + global error-handling middleware
client/
  src/
    hooks/useChat.js            single socket connection, presence map, active-room state, reconnect-rejoin
    context/AuthContext.jsx
    context/ToastContext.jsx
    lib/api.js                  REST client (incl. file upload)
    components/                 Sidebar, MessageBubble, Composer, icons
    pages/                      Auth, Chat
    index.css                   dark teal design system (distinct from the other three projects)
```

## 10. Manual test checklist

- [ ] Register two users; each sees the other in the "new DM" user picker
- [ ] Create a public room from one account → the other account sees it in their room list without refreshing (on next load)
- [ ] Send a message in a public room → appears live for anyone else with that room open, persists across a page reload
- [ ] Open a DM between two users → same canonical room every time (not a new one per session)
- [ ] Your own messages render right-aligned in the accent color; others' render left-aligned with their name/avatar
- [ ] Typing in a conversation shows a live "…typing" indicator to the other participant within ~3 seconds, and it clears after they stop
- [ ] A sent message shows a single check; once the recipient has that conversation open, it flips to a double check live
- [ ] Presence dot and "Online"/"Last seen" text update live when the other user connects/disconnects
- [ ] Upload a file via the composer's paperclip icon → it appears inline (image) or as a download link (other files) for both participants
- [ ] Restart the server mid-conversation → both clients reconnect and keep receiving messages/typing for the room they had open (not just for a freshly-selected one)
