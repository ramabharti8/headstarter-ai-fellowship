# SyncBoard — Live Collaboration Tool

Real-time collaborative documents (true CRDT sync via Yjs) and a shared whiteboard, with JWT auth, MongoDB persistence, live presence/cursors, and version history.

See [HANDBOOK.md](./HANDBOOK.md) for full architecture, setup, and deployment documentation.

## Quick start

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
docker compose up -d mongo   # from the project root
npm run dev:server           # terminal 1, from the project root
npm run dev:client           # terminal 2, from the project root
```

Open http://localhost:5174

## Stack

- **Frontend:** React + Vite, React Router, socket.io-client, Yjs
- **Backend:** Node.js, Express, Socket.IO, Yjs, MongoDB (Mongoose), JWT auth
- **Deployment:** Dockerfiles for both services + `docker-compose.yml`

## Structure

```
server/   Express + Socket.IO collaboration/API server
client/   React + Vite frontend
docker-compose.yml
HANDBOOK.md
```
