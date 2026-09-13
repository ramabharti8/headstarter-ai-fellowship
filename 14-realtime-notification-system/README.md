# SignalBox — Real-Time Notification System

Real-time notification delivery with JWT auth, topic subscriptions, a notification center (bell + inbox), multi-channel delivery (in-app + email), and Redis-backed delivery tracking.

See [HANDBOOK.md](./HANDBOOK.md) for full architecture, setup, and deployment documentation.

## Quick start

```bash
cd server && npm install && cp .env.example .env
cd ../client && npm install && cp .env.example .env
docker compose up -d mongo redis   # from the project root
npm run dev:server                 # terminal 1, from the project root
npm run dev:client                 # terminal 2, from the project root
```

Open http://localhost:5175

## Stack

- **Frontend:** React + Vite, React Router, socket.io-client
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), Redis (ioredis), JWT auth, Nodemailer
- **Deployment:** Dockerfiles for both services + `docker-compose.yml`

## Structure

```
server/   Express + Socket.IO notification API/delivery server
client/   React + Vite frontend (light/amber theme)
docker-compose.yml
HANDBOOK.md
```
