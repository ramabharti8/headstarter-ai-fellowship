# Video Conferencing App

Peer-to-peer video conferencing with screen sharing, built with WebRTC and Socket.IO signaling.

## What It Does

- Create and join video conference rooms
- Peer-to-peer video/audio via WebRTC (no media server needed)
- Screen sharing support
- Mute audio / disable video controls
- Participant join/leave events

## Tech Stack

- **Signaling**: Node.js + Express + Socket.IO
- **Video**: WebRTC (browser-native)
- **Frontend**: Vanilla JS or React (in `public/`)

## Project Structure

```
12-video-conferencing-app/
├── server/
│   └── index.js      # Signaling server
├── public/           # Frontend HTML/JS
├── package.json
└── README.md
```

## Setup

```bash
npm install
npm start             # Signaling server on port 3002
```

## WebRTC Flow

1. Client A creates a room → gets `roomId`
2. Client B joins with `roomId`
3. Signaling server exchanges `offer`, `answer`, `ice_candidate` events
4. Direct P2P connection established between peers

## Socket Events

| Event | Description |
|-------|-------------|
| `join_room` | Join a video room |
| `offer` / `answer` | WebRTC SDP exchange |
| `ice_candidate` | ICE candidate exchange |
| `screen_share_started` | Notify peers of screen share |
| `toggle_audio` / `toggle_video` | Media state updates |
