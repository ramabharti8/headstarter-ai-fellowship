import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { LockIcon, ChevronRightIcon } from "../components/icons";

export default function Home() {
  const [joinRoomId, setJoinRoomId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const createRoom = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { roomId } = await api.createRoom({ name: roomName, password: roomPassword || undefined }, token);
      navigate(`/room/${roomId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    navigate(`/room/${joinRoomId.trim().toUpperCase()}`);
  };

  return (
    <div className="home-page">
      <nav className="top-nav">
        <div className="brand">
          <span className="brand-mark">M</span>
          MeetFlow
        </div>
        {user ? (
          <div className="user-chip">
            <span className="avatar-circle avatar-xs">{user.username[0]?.toUpperCase()}</span>
            {user.username}
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <a href="/login" className="ghost-link-btn">
            Sign in
          </a>
        )}
      </nav>

      <div className="hero">
        <h1>
          Crystal-clear video calls,
          <br />
          zero setup.
        </h1>
        <p>Peer-to-peer video conferencing with screen sharing, live chat, reactions, and recording.</p>
      </div>

      <div className="home-cards">
        <div className="card action-card">
          <h3>Start a new meeting</h3>
          <p className="card-hint">Create a room and share the invite link.</p>
          <form className="stacked-form" onSubmit={createRoom}>
            <input placeholder="Meeting name (optional)" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            <div className="input-with-icon">
              <LockIcon width={16} height={16} />
              <input
                placeholder="Password (optional)"
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="primary-btn" disabled={creating}>
              {creating ? "Creating…" : "Create room"}
              <ChevronRightIcon width={18} height={18} />
            </button>
          </form>
        </div>

        <div className="card action-card">
          <h3>Join a meeting</h3>
          <p className="card-hint">Enter the room ID someone shared with you.</p>
          <form className="stacked-form" onSubmit={joinRoom}>
            <input
              placeholder="Room ID, e.g. A1B2C3D4"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              style={{ textTransform: "uppercase" }}
            />
            <button type="submit" className="secondary-btn">
              Join room
              <ChevronRightIcon width={18} height={18} />
            </button>
          </form>
        </div>
      </div>

      <div className="feature-strip">
        <div className="feature-item">
          <strong>Multi-party mesh</strong>
          <span>Direct peer-to-peer video, no media server</span>
        </div>
        <div className="feature-item">
          <strong>Screen sharing</strong>
          <span>Swap your camera feed for your screen instantly</span>
        </div>
        <div className="feature-item">
          <strong>Live chat & reactions</strong>
          <span>Stay in sync without interrupting the speaker</span>
        </div>
        <div className="feature-item">
          <strong>Recording</strong>
          <span>Save your call locally, synced to your account</span>
        </div>
      </div>
    </div>
  );
}
