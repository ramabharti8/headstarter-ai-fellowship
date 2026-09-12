import { useState } from "react";

const SUGGESTED_ROOMS = ["general", "random", "tech-talk"];

export default function JoinForm({ onJoin }) {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmedName = username.trim();
    const trimmedRoom = room.trim();
    if (!trimmedName || !trimmedRoom) return;
    onJoin(trimmedName, trimmedRoom);
  }

  return (
    <div className="join-screen">
      <form className="join-card" onSubmit={handleSubmit}>
        <h1>Realtime Chat</h1>
        <p className="subtitle">Join a room and start chatting</p>

        <label htmlFor="username">Display name</label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={24}
          autoFocus
        />

        <label htmlFor="room">Room name</label>
        <input
          id="room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="e.g. general"
          maxLength={32}
        />

        <div className="room-suggestions">
          {SUGGESTED_ROOMS.map((r) => (
            <button type="button" key={r} onClick={() => setRoom(r)}>
              #{r}
            </button>
          ))}
        </div>

        <button type="submit" className="primary" disabled={!username.trim() || !room.trim()}>
          Join room
        </button>
      </form>
    </div>
  );
}
