# Real-Time Chat App

Multi-room chat application with live typing indicators, built with Node.js and Socket.IO.

## What It Does

- Multiple chat rooms with unique names
- Real-time message delivery via WebSockets
- Live typing indicators (`user is typing...`)
- Join/leave notifications
- Online user list per room

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + socket.io-client (in `client/`)

## Project Structure

```
11-realtime-chat-app/
├── server/
│   └── index.js      # Socket.IO server
├── client/           # React frontend (create with: npx create-react-app client)
├── package.json
└── README.md
```

## Setup

```bash
npm install
npm start             # Starts server on port 3001
```

## Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `join_room` | client → server | `{username, room}` |
| `send_message` | client → server | `{room, message}` |
| `typing` | client → server | `{room, username}` |
| `receive_message` | server → client | `{id, username, message, timestamp}` |
| `user_typing` | server → client | `{username}` |
| `room_users` | server → client | `{room, users}` |
