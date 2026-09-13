# SyncBoard — Project Handbook

## 1. Overview

SyncBoard is a real-time collaborative platform with two surfaces:

- **Documents** — multiple people co-write the same plain-text document with true **CRDT** merging via [Yjs](https://docs.yjs.dev/), so concurrent edits from different users never conflict or overwrite each other, even offline-then-reconnect.
- **Whiteboards** — a shared canvas where strokes from every connected user are broadcast and persisted in real time.

Both are backed by MongoDB for durability (documents/boards survive server restarts) and support optional JWT auth for ownership, private "my documents/boards" lists, and document version history.

### Feature set
- Email/password auth (JWT), guest access also supported (a stable per-tab guest name/color)
- Create/join documents and whiteboards by shareable ID
- **Real CRDT text sync** — Yjs `Y.Doc`/`Y.Text` merges concurrent edits deterministically; verified to survive a full server restart via persisted binary state
- Live presence bar (who's in the document/board right now) and live cursor position / pointer tracking between users
- **Version history** — manual "Save version" snapshots plus periodic auto-snapshots while a document is being actively edited, with one-click restore
- A shared drawing canvas: color/size picker, eraser, clear board, persisted strokes
- Toast notification system for errors and confirmations
- Dockerized for deployment

## 2. Architecture

```
┌─────────────┐        HTTPS/REST (auth, docs, boards, versions)  ┌──────────────┐
│   Browser A │ ───────────────────────────────────────────────▶ │   Express    │
│  (React app)│ ◀────────────── Socket.IO (CRDT + strokes) ──────▶ │  + Socket.IO │
└─────────────┘                                                    └──────┬───────┘
                                                                           │ MongoDB
                                                                           ▼
                                                                    ┌──────────────┐
                                                                    │ users/docs/  │
                                                                    │ versions/    │
                                                                    │ whiteboards  │
                                                                    └──────────────┘
```

Unlike the video-conferencing app in this repo, there is **no peer-to-peer media** here — all document/whiteboard state flows through the server, which is exactly what makes CRDT merging and durable persistence possible: the server holds the authoritative `Y.Doc` per document and the authoritative stroke list per board.

- **server/src/sockets/docRooms.js** — one in-memory `Y.Doc` per active document (`docId → { ydoc, clients, ... }`), loaded from MongoDB on first join, debounce-persisted back to MongoDB (`PERSIST_INTERVAL_MS`), with periodic auto-snapshots (`SNAPSHOT_INTERVAL_MS`) into a separate version-history collection.
- **server/src/sockets/boardRooms.js** — the whiteboard equivalent: an in-memory stroke array per board, debounce-persisted the same way. Strokes are append-only, so no CRDT merge logic is needed — concurrent strokes never conflict.
- **server/src/sockets/index.js** — wires both room managers to Socket.IO events and presence bookkeeping.
- **client/src/hooks/useYDoc.js** — owns a client-side `Y.Doc`, binds it to a plain `<textarea>` by diffing old/new values on every keystroke (common-prefix/suffix diff → `Y.Text` insert/delete), and exchanges Yjs binary updates with the server over Socket.IO (`doc_sync` for the full state on join, `doc_update` for incremental changes).
- **client/src/hooks/useWhiteboard.js** — the canvas equivalent: stroke state, presence, and pointer broadcasting.

## 3. How the CRDT text sync actually works

1. On `join_document`, the server sends the *entire* current CRDT state as a Yjs-encoded binary update (`doc_sync`). The client applies it to a fresh local `Y.Doc` with `Y.applyUpdate(doc, state, "remote")` — tagging the origin as `"remote"` so the client's own update-listener doesn't echo it straight back to the server.
2. When the user types, `useYDoc`'s `applyLocalChange` diffs the textarea's previous value against the new one (common-prefix/suffix diff — cheap and correct for the common case of one person typing at a cursor) and applies the resulting delete+insert as a single `Y.Doc` transaction tagged `"local"`.
3. That transaction fires the `Y.Doc`'s `update` event with the encoded binary diff; because its origin is `"local"` (not `"remote"`), the client forwards it to the server as `doc_update`.
4. The server applies that update to its own authoritative `Y.Doc` for the room and rebroadcasts the same binary diff to every *other* client in the room, who apply it with origin `"remote"`.
5. Every client's `Y.Text` converges to the same string regardless of the order updates arrive in — that's the CRDT guarantee. Two people typing in different parts of the document at the same time never lose either edit.

**Known simplification:** cursor position for *remote* users is shown as a small "username @ offset" badge above the editor rather than an inline caret rendered at the exact text position. A plain `<textarea>` can't render multiple carets; getting true inline multi-cursor rendering means moving to a real rich-text editor with Yjs bindings (e.g. `y-codemirror.next` or `y-prosemirror`), which was out of scope for a from-scratch build at this size. The presence/cursor *data* is already flowing correctly end-to-end — only the visual caret overlay is simplified.

## 4. Known limitations & scaling path

- **In-memory room state is per-process** — running multiple server instances behind a load balancer would split a document's collaborators across processes with no shared `Y.Doc`. Fix: a Yjs persistence/sync adapter backed by Redis pub/sub, or a dedicated Yjs sync server (e.g. `y-redis`), shared by all instances.
- **Whiteboard strokes are stored as a flat array with entire-board persistence** — fine for a moderate stroke count, but a very long-lived, heavily-drawn-on board will grow the document that gets rewritten to MongoDB on every debounce tick. For heavy use, switch to incremental append (e.g. a capped collection or per-stroke documents) instead of rewriting the whole array.
- **No TURN/media concerns here** (unlike the video app) since everything is server-relayed, but that also means the server is a hard dependency for every edit — there's no peer-to-peer fallback if the server is unreachable, only local optimistic UI until reconnect.
- **Guest identity is per-tab (`sessionStorage`)** — a guest's name/color resets in a new tab or after clearing session storage; there is no persistent guest identity across sessions (only signed-in users are stable).

## 5. Environment variables

**server/.env**
| Var | Purpose |
|---|---|
| `PORT` | server port (default 3003) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | secret for signing auth tokens — must be long/random in production |
| `CLIENT_ORIGIN` | CORS allowed origin for the frontend |
| `NODE_ENV` | `production` enables serving the built client from `client/dist` |
| `PERSIST_INTERVAL_MS` | how often a "dirty" document/board is flushed to MongoDB (default 5000) |
| `SNAPSHOT_INTERVAL_MS` | how often an active document gets an automatic version snapshot (default 120000) |

**client/.env**
| Var | Purpose |
|---|---|
| `VITE_SERVER_URL` | Base URL of the API/signaling server (leave blank if served from the same origin, e.g. behind the nginx proxy in docker-compose) |

## 6. Local development

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
```

Start MongoDB (either your own local instance on port 27017 — update `server/.env` accordingly — or via Docker Compose, which maps it to host port **27018** to avoid clashing with the video-conferencing-app project if both run side by side):

```bash
docker compose up -d mongo
```

Then, in two terminals:

```bash
npm run dev:server    # http://localhost:3003
npm run dev:client    # http://localhost:5174 (proxies /api & /socket.io)
```

MongoDB is optional for a quick smoke test: the server logs a warning and keeps running without persistence — documents/whiteboards still work over sockets for the lifetime of the process, but nothing survives a restart and auth won't work.

## 7. Deployment

### Docker Compose (single host)
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
```
Brings up MongoDB, the API/signaling server, and an nginx-served client build (nginx proxies `/api` and `/socket.io` to the server container). Exposes the app on port **8081** (distinct from the video app's 8080).

### Split hosting (e.g. Render + Vercel)
1. Deploy `server/` as a Node web service. Set `MONGO_URI` (e.g. MongoDB Atlas), `JWT_SECRET`, `CLIENT_ORIGIN`.
2. Deploy `client/` as a static site. Set `VITE_SERVER_URL` to the deployed server's URL at build time.

## 8. Project structure

```
server/
  src/
    config/db.js              MongoDB connection
    models/                    User, Document, DocumentVersion, Whiteboard
    middleware/auth.js         JWT sign/verify (HTTP + socket), requireAuth/optionalAuth
    routes/                    auth.js, documents.js, whiteboards.js
    sockets/docRooms.js        In-memory Y.Doc rooms, debounced persistence, snapshots, restore
    sockets/boardRooms.js      In-memory stroke rooms, debounced persistence
    sockets/index.js           Socket.IO event wiring for both
    index.js                   app entrypoint
client/
  src/
    hooks/useYDoc.js           Y.Doc <-> textarea binding + Socket.IO sync
    hooks/useWhiteboard.js     canvas stroke state + Socket.IO sync
    context/AuthContext.jsx
    context/ToastContext.jsx
    lib/api.js                 REST client
    components/                icons.jsx, PresenceBar, VersionHistoryPanel
    pages/                     Home, Auth, DocumentEditor, Whiteboard
    index.css                  design tokens + all component styles
```

## 9. Manual test checklist

- [ ] Register, login, logout
- [ ] Create a document, open it in two tabs/browsers, type in one — the other updates live with no lost keystrokes
- [ ] Type in *both* tabs at once (different parts of the text) — both edits land, text stays consistent in both tabs
- [ ] Presence bar shows all connected users; the other tab's live cursor offset is visible
- [ ] "Save version" while signed in → toast confirms; "History" panel lists it with a timestamp and preview
- [ ] Edit the document further, then "Restore" an earlier version → text reverts exactly, and the change propagates to all connected tabs
- [ ] Restart the server (or `docker compose restart server`) → reopening the same document/whiteboard shows the last-persisted state, not a blank one
- [ ] Create a whiteboard, draw with different colors/sizes, use the eraser, "Clear board" — all update live in a second tab
- [ ] Whiteboard strokes survive a server restart (MongoDB persistence, not just in-memory)
- [ ] Signed-in "Your documents" / "Your whiteboards" lists on the home page show only your own items
