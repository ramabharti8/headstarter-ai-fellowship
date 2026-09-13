# MeetFlow — Project Handbook

## 1. Overview

MeetFlow is a peer-to-peer video conferencing application. Media (audio/video/screen) flows directly between browsers over WebRTC; the server's only job during a call is **signaling** — introducing peers to each other and relaying session descriptions and ICE candidates. This keeps media costs at zero (no SFU/media server) at the cost of not scaling well past ~6-8 participants per room (mesh topology — see §4).

### Feature set
- Email/password auth (JWT), guest join also supported
- Create/join rooms, optional room password
- Pre-join **lobby**: camera/mic preview, device toggles, and display name before entering the call
- Multi-party mesh video/audio calls
- Screen sharing (replaces the outgoing video track)
- Real-time text chat and emoji reactions, with a dedicated participants panel
- In-call recording (client-side `MediaRecorder`) — always saved as a local download; also uploaded to the server if signed in
- Toast notification system for errors and confirmations (media/permission failures, recording saved, connection issues)
- A cohesive dark design system (Inter typeface, custom SVG icon set, consistent spacing/color tokens) instead of default browser styling or emoji icons
- Dockerized for deployment

## 2. Architecture

```
┌─────────────┐        HTTPS/REST (auth, rooms, recordings)       ┌──────────────┐
│   Browser A │ ───────────────────────────────────────────────▶ │   Express    │
│  (React app)│ ◀────────────────── Socket.IO (signaling) ──────▶ │  + Socket.IO │
└─────┬───────┘                                                    └──────┬───────┘
      │                                                                   │
      │  direct WebRTC media (audio/video/screen)                        │ MongoDB
      ▼                                                                   ▼
┌─────────────┐                                                    ┌──────────────┐
│   Browser B │                                                    │  users/rooms │
└─────────────┘                                                    │  /recordings │
                                                                    └──────────────┘
```

- **server/** — Express REST API (`/api/auth`, `/api/rooms`, `/api/recordings`) + a Socket.IO namespace handling `join_room`, `offer`/`answer`/`ice_candidate` relay, `chat_message`, `reaction`, presence events. Room membership is kept in an in-memory `Map` (per-process); `Room`/`User`/`Recording` documents persist in MongoDB.
- **client/** — React SPA. `useMeshCall` (`client/src/hooks/useMeshCall.js`) is the core: it owns the Socket.IO connection and one `RTCPeerConnection` per remote participant. `useRecorder` wraps `MediaRecorder`, always triggers a local file download when a recording stops, and additionally uploads the blob via `multipart/form-data` when the user is authenticated.

### Call flow (page states)

`Room.jsx` drives a small state machine, `gate`:

1. `checking` — looks up the room via `GET /api/rooms/:id`.
2. `needs-password` — shown only if the room was created with a password; blocks until `POST /api/rooms/:id/verify` succeeds.
3. `lobby` — renders `Lobby.jsx`, which independently acquires a camera/mic preview stream, lets the user toggle mic/cam and set a display name, then hands the (possibly `null`, if permission was denied) stream to the call.
4. `call` — mounts `useMeshCall` with that stream via `initialStream`, so the browser is never asked for permission twice. If the lobby's `getUserMedia` call failed, the user can still click **"Join without camera/mic"** — the call proceeds receive-only rather than blocking them forever.

### Design system

`client/src/index.css` defines the full token set (`--bg`, `--surface`, `--accent`, radii, shadows) plus every component class used across the app — there is no per-component inline styling and no emoji-as-icon. `client/src/components/icons.jsx` is a small dependency-free set of stroke-based SVG icons (mic, camera, screen-share, record, chat, leave, etc.) shared by the lobby and in-call controls. `ToastContext.jsx` provides `useToast().{info,success,error}(message)` for any component to surface transient, dismissible feedback (top-right stack, auto-expiring).

## 3. Signaling protocol (Socket.IO events)

| Event (client→server) | Payload | Purpose |
|---|---|---|
| `join_room` | `{ roomId, username, token }` | Join a room; server replies with `existing_participants` and notifies others via `user_connected` |
| `offer` / `answer` / `ice_candidate` | `{ targetId, ... }` | Relayed 1:1 to `targetId` only — server never inspects SDP |
| `toggle_audio` / `toggle_video` | `{ muted }` / `{ videoOff }` | Broadcast presence state to room |
| `screen_share_started` / `_stopped` | — | Notify room of screen-share state |
| `chat_message` | `{ text }` | Broadcast to whole room |
| `reaction` | `{ emoji }` | Broadcast, auto-expires client-side after 3s |
| `leave_room` | — | Explicit leave (also handled by `disconnect`) |

Mesh join sequence: new peer emits `join_room` → gets `existing_participants` → **calls each existing peer** (creates `RTCPeerConnection`, sends `offer`). Existing peers answer. This means the Nth joiner creates N-1 connections; total connections in an M-person room = M(M-1)/2.

## 4. Known limitations & scaling path

- **Mesh doesn't scale past ~6-8 participants** — CPU/bandwidth on each client grows linearly with room size. For larger rooms, replace the mesh with an SFU (e.g. mediasoup, LiveKit, or Janus) — the signaling server's `sockets/index.js` is the place to swap logic; the client's `useMeshCall` would instead send a single stream to the SFU.
- **Room membership is in-memory** — restarting the server drops active call presence (not the Room/User records in Mongo). For multi-instance deployment, back this with Redis pub/sub (socket.io-redis adapter).
- **No TURN server configured** — only STUN (`stun.l.google.com`). Peers behind symmetric NATs/restrictive firewalls may fail to connect. Add a TURN server (coturn, or a paid provider like Twilio/Xirsys) to `ICE_SERVERS` in `client/src/hooks/useMeshCall.js` for production reliability.
- **Recording is client-side per-participant** — each client can record only the streams rendered in their own browser (their local view — i.e. just their own camera/mic, not the full call grid), not a true server-side mixed recording. A single authoritative recording would require an SFU + server-side compositing. The local `.webm` download always happens, regardless of login; only the optional cloud backup copy requires an account.
- **No camera in a sandboxed/headless browser** — `getUserMedia`/`getDisplayMedia` require a real device and an explicit user permission grant; they cannot be exercised in a fully automated/headless environment. The lobby and recorder are both written to degrade gracefully (join without media, surface a toast) rather than fail silently when that happens.

## 5. Environment variables

**server/.env**
| Var | Purpose |
|---|---|
| `PORT` | server port (default 3002) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | secret for signing auth tokens — must be long/random in production |
| `CLIENT_ORIGIN` | CORS allowed origin for the frontend |
| `NODE_ENV` | `production` enables serving the built client from `client/dist` |

**client/.env**
| Var | Purpose |
|---|---|
| `VITE_SERVER_URL` | Base URL of the API/signaling server (leave blank if served from the same origin, e.g. behind the nginx proxy in docker-compose) |

## 6. Local development

```bash
npm run install:all
cp server/.env.example server/.env      # edit MONGO_URI/JWT_SECRET
cp client/.env.example client/.env
npm run dev:server                       # http://localhost:3002
npm run dev:client                       # http://localhost:5173 (proxies /api & /socket.io)
```

MongoDB is optional for a quick smoke test: the server logs a warning and keeps running without persistence (auth/room-password features will fail without it; anonymous ad-hoc rooms still work over sockets).

## 7. Deployment

### Option A — Docker Compose (single host)
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build -d
```
Brings up MongoDB, the API/signaling server, and an nginx-served client build, wired together (nginx proxies `/api` and `/socket.io` to the server container). Exposes the app on port 8080.

### Option B — Split hosting (e.g. Render + Vercel)
1. Deploy `server/` as a Node web service (Render/Railway/Fly.io). Set `MONGO_URI` (e.g. MongoDB Atlas), `JWT_SECRET`, `CLIENT_ORIGIN` to your frontend's deployed URL.
2. Deploy `client/` as a static site (Vercel/Netlify). Set `VITE_SERVER_URL` to the deployed server's URL at build time.
3. Recording uploads are stored on the server's local disk (`server/uploads/recordings`) — on ephemeral-filesystem hosts (most PaaS), mount a persistent volume or swap `multer.diskStorage` for S3-compatible storage before relying on recordings long-term.

## 8. Project structure

```
server/
  src/
    config/db.js          MongoDB connection
    models/                User, Room, Recording (Mongoose schemas)
    middleware/auth.js     JWT sign/verify, requireAuth/optionalAuth
    routes/                auth.js, rooms.js, recordings.js
    sockets/index.js       Socket.IO signaling + chat/reactions/presence
    index.js               app entrypoint
client/
  src/
    hooks/useMeshCall.js   WebRTC mesh + signaling client
    hooks/useRecorder.js   MediaRecorder + local download + optional upload
    context/AuthContext.jsx
    context/ToastContext.jsx   toast notification system
    lib/api.js             REST client
    components/            icons.jsx, Lobby, VideoTile, Controls, ChatPanel, ParticipantsPanel
    pages/                 Home, Auth, Room
    index.css              design tokens + all component styles
```

## 9. Manual test checklist

- [ ] Register, login, logout
- [ ] Create a room (with and without password), join as guest and as authenticated user
- [ ] Lobby shows a live camera preview; mic/cam toggle buttons work before joining
- [ ] Denying camera/mic permission still lets you join ("Join without camera/mic"), instead of getting stuck
- [ ] Two browser tabs/windows join the same room → both video tiles appear
- [ ] A third participant joins → mesh connects to both existing peers
- [ ] Mute/unmute, camera on/off reflected on remote tile
- [ ] Screen share starts/stops, remote sees screen then reverts to camera
- [ ] Chat message and emoji reaction appear for all participants; participants panel lists everyone with mute/camera badges
- [ ] Start recording → red "REC 00:xx" indicator appears in the control bar
- [ ] Stop recording → a `.webm` file downloads immediately in the browser; if logged in, a success toast confirms the cloud copy too, and the file is listed via `GET /api/recordings/room/:roomId`
- [ ] Trying to record with no active camera/mic stream shows a clear error toast instead of doing nothing
- [ ] Leaving/closing a tab removes that participant's tile for everyone else
