# Real-Time Chat App

Multi-room chat application with live typing indicators, built with Node.js, Socket.IO, and React (Vite).

## What It Does

- Multiple chat rooms with unique names
- Real-time message delivery via WebSockets
- Live typing indicators ("user is typing...")
- Join/leave notifications
- Online user list per room
- Responsive UI (desktop + mobile)

## Tech Stack

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** React (Vite) + socket.io-client
- **Deploy:** single Node service serves the built client and the Socket.IO API

## Project Structure

```
11-realtime-chat-app/
├── server/
│   └── index.js        # Express + Socket.IO server (also serves client/dist in prod)
├── client/              # React (Vite) frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── JoinForm.jsx
│   │   │   └── ChatRoom.jsx
│   │   ├── socket.js    # socket.io-client instance
│   │   └── App.jsx
│   └── .env.example     # VITE_SERVER_URL
├── render.yaml           # Render.com deploy config
└── package.json
```

## Local Development

Run the server and client separately with hot reload:

```bash
npm install
npm run dev            # server on http://localhost:3001 (nodemon)
```

In a second terminal:

```bash
npm run client:install
npm run client          # Vite dev server on http://localhost:5173
```

Copy `client/.env.example` to `client/.env` if your server runs on a different URL.

## Production Build (single service)

The server serves the built client from `client/dist`, so the whole app can run as one process:

```bash
npm install
npm run build            # installs client deps and builds client/dist
npm start                # serves API + Socket.IO + client on $PORT (default 3001)
```

## Deploying

### Option A — one service (recommended)

Deploy this folder as a single Node web service (Render, Railway, Fly.io, etc.):

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Env vars:** `CLIENT_ORIGIN` (optional, defaults to `*`)

A ready-to-use `render.yaml` is included — on Render, "New +" → "Blueprint" and point it at this repo/folder.

### Option B — split deploy

- Deploy `server/` to any Node host, set `CLIENT_ORIGIN` to your client's URL.
- Deploy `client/` (static Vite build) to Vercel/Netlify, set `VITE_SERVER_URL` to the server's URL.

## Socket Events

| Event | Direction | Payload |
|---|---|---|
| `join_room` | client → server | `{username, room}` |
| `send_message` | client → server | `{room, message}` |
| `typing` | client → server | `{room, username}` |
| `stop_typing` | client → server | `{room, username}` |
| `receive_message` | server → client | `{id, username, message, timestamp}` |
| `user_typing` | server → client | `{username}` |
| `user_stopped_typing` | server → client | `{username}` |
| `user_joined` / `user_left` | server → client | `{username, timestamp}` |
| `room_users` | server → client | `{room, users}` |

## REST Endpoints

- `GET /api/rooms` — list active rooms
- `GET /api/health` — health check
