# Real-Time Notification System

Push notification delivery system with delivery tracking, built with Socket.IO and Redis.

## What It Does

- Sends real-time push notifications to connected users
- Queues notifications in Redis for offline users (delivered on reconnect)
- Tracks delivery status: `sent` → `delivered` → `acknowledged`
- Supports broadcast notifications to all connected users
- Delivery receipt lookup by notification ID

## Tech Stack

- **Real-Time**: Socket.IO
- **Queue**: Redis (ioredis)
- **Server**: Node.js + Express

## Setup

```bash
cp .env.example .env
# Requires a running Redis instance
npm install
npm start             # Server on port 3004
```

## API

```
POST /api/notify              — Send notification to a specific user
POST /api/broadcast           — Broadcast to all connected users
GET  /api/delivery/:id        — Get delivery status
GET  /health                  — Health check + connected user count
```

### Example

```bash
# Send to a user
curl -X POST http://localhost:3004/api/notify \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123", "title": "New Order", "message": "Order #456 confirmed", "type": "success"}'

# → {"notificationId": "uuid", "status": "delivered"}

# Check delivery
curl http://localhost:3004/api/delivery/<notificationId>
```

## Socket Events (Client)

| Event | Direction | Description |
|-------|-----------|-------------|
| `authenticate` | client → server | `{userId}` — register user |
| `acknowledge` | client → server | `{notificationId}` — mark read |
| `notification` | server → client | Incoming notification |
| `broadcast` | server → client | Broadcast notification |
