# Wisp — Real-Time Chat App

Real-time chat with JWT auth, persistent public rooms and 1:1 direct messages, live presence, typing indicators, read receipts, and file/image sharing.

See [HANDBOOK.md](./HANDBOOK.md) for full architecture, setup, and deployment documentation.

## Quick start

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
docker compose up -d mongo   # from the project root
npm run dev:server           # terminal 1, from the project root
npm run dev:client           # terminal 2, from the project root
```

Open http://localhost:5176

## Stack

- **Frontend:** React + Vite, React Router, socket.io-client
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT auth, Multer
- **Deployment:** Dockerfiles for both services + `docker-compose.yml`

## Structure

```
server/   Express + Socket.IO chat/API server
client/   React + Vite frontend (dark teal theme)
docker-compose.yml
HANDBOOK.md
```
