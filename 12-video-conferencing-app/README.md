# MeetFlow — Video Conferencing App

A full-stack, production-grade peer-to-peer video conferencing app: multi-party WebRTC mesh calls, screen sharing, real-time chat & reactions, JWT auth with MongoDB-backed rooms, and in-call recording with server-side storage.

See [HANDBOOK.md](./HANDBOOK.md) for full architecture, setup, and deployment documentation.

## Quick start

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

Open http://localhost:5173

## Stack

- **Frontend:** React + Vite, React Router, socket.io-client, native WebRTC
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT auth, Multer
- **Deployment:** Dockerfiles for both services + `docker-compose.yml`

## Structure

```
server/   Express + Socket.IO signaling/API server
client/   React + Vite frontend
docker-compose.yml
HANDBOOK.md
```
