# Live Collaboration Tool

Real-time shared whiteboard and collaborative document editing via WebSockets.

## What It Does

- **Document Editing**: Multiple users edit the same document simultaneously
- **Cursor Tracking**: See where other users' cursors are
- **Whiteboard**: Draw strokes collaboratively on a shared canvas
- **Persistence**: Documents stored in memory (swap for Redis/DB for durability)

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React (in `client/`)
- **Optional**: Yjs for conflict-free CRDT document merging

## Project Structure

```
13-live-collaboration-tool/
├── server/
│   └── index.js      # Collaboration server
├── client/           # React frontend
├── package.json
└── README.md
```

## Setup

```bash
npm install
npm start             # Server on port 3003
```

## Socket Events

| Event | Description |
|-------|-------------|
| `join_document` | Join a document editing session |
| `document_change` | Broadcast text delta to peers |
| `cursor_move` | Update cursor position |
| `join_whiteboard` | Join a whiteboard session |
| `draw_stroke` | Broadcast a draw stroke |
| `clear_whiteboard` | Clear the board for all users |
