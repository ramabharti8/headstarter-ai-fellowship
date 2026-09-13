import { useCallback, useMemo, useState } from "react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { useMeshCall } from "../hooks/useMeshCall";
import { useRecorder } from "../hooks/useRecorder";
import Lobby from "../components/Lobby";
import VideoTile from "../components/VideoTile";
import Controls from "../components/Controls";
import ChatPanel from "../components/ChatPanel";
import ParticipantsPanel from "../components/ParticipantsPanel";
import { LockIcon } from "../components/icons";

export default function Room() {
  const { roomId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [gate, setGate] = useState("checking"); // checking | needs-password | lobby | call
  const [passwordInput, setPasswordInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [session, setSession] = useState(null); // { username, stream }
  const [panel, setPanel] = useState(null); // null | 'chat' | 'participants'
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    api
      .getRoom(roomId)
      .then((room) => setGate(room.hasPassword ? "needs-password" : "lobby"))
      .catch(() => setGate("lobby")); // ad-hoc room not in DB — allow it
  }, [roomId]);

  const handleCallEvent = useCallback(
    (event) => {
      if (event.type === "media-error") toast.error(`Camera/microphone access failed: ${event.message}`, 6000);
      if (event.type === "connect-error") toast.error(`Connection issue: ${event.message}`);
    },
    [toast]
  );

  const {
    localStream,
    participants,
    messages,
    reactions,
    screenSharing,
    toggleAudio,
    toggleVideo,
    shareScreen,
    stopScreenShare,
    sendMessage,
    sendReaction,
  } = useMeshCall({
    roomId,
    username: session?.username,
    token: gate === "call" ? token : null,
    initialStream: session?.stream,
    onEvent: handleCallEvent,
  });

  const handleRecorderEvent = useCallback(
    (event) => {
      if (event.type === "saved") toast.success(`Recording saved to your downloads: ${event.filename}`);
      if (event.type === "uploaded") toast.success("Recording also backed up to your account.");
      if (event.type === "error") toast.error(event.message, 6000);
    },
    [toast]
  );

  const { recording, uploading, elapsedSec, start, stop } = useRecorder({
    roomId,
    token,
    onEvent: handleRecorderEvent,
  });

  const tiles = useMemo(() => Array.from(participants.entries()), [participants]);

  const verifyPassword = async (e) => {
    e.preventDefault();
    setGateError("");
    try {
      await api.verifyRoom(roomId, passwordInput);
      setGate("lobby");
    } catch (err) {
      setGateError(err.message);
    }
  };

  const handleJoinFromLobby = (username, stream) => {
    setSession({ username, stream });
    setGate("call");
  };

  const handleToggleRecording = () => {
    if (recording) stop();
    else start(localStream);
  };

  const handleLeave = () => navigate("/");

  if (gate === "checking") {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  if (gate === "needs-password") {
    return (
      <div className="page-center">
        <div className="card">
          <div className="card-icon-badge">
            <LockIcon width={22} height={22} />
          </div>
          <h1>Room {roomId}</h1>
          <p className="subtitle">This room is password protected.</p>
          {gateError && <div className="error-banner">{gateError}</div>}
          <form className="stacked-form" onSubmit={verifyPassword}>
            <input
              type="password"
              placeholder="Room password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            <button type="submit" className="primary-btn">
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (gate === "lobby") {
    return (
      <Lobby
        roomId={roomId}
        defaultUsername={user?.username}
        onJoin={handleJoinFromLobby}
        onError={(msg) => toast.error(`Camera/microphone access failed: ${msg}`, 6000)}
      />
    );
  }

  return (
    <div className="room-layout">
      <div className="room-header">
        <div className="room-header-left">
          <span className="room-id-chip">{roomId}</span>
        </div>
        <div className="room-header-right">{tiles.length + 1} in call</div>
      </div>

      <div className={`room-body ${panel ? "with-panel" : ""}`}>
        <div className="video-grid">
          <VideoTile stream={localStream} username={`${session?.username} (You)`} muted={muted} videoOff={videoOff} isLocal />
          {tiles.map(([socketId, p]) => (
            <VideoTile key={socketId} stream={p.stream} username={p.username} muted={p.muted} videoOff={p.videoOff} />
          ))}
        </div>

        {panel === "chat" && (
          <ChatPanel
            messages={messages}
            onSend={sendMessage}
            onReact={sendReaction}
            onClose={() => setPanel(null)}
            currentUsername={session?.username}
          />
        )}
        {panel === "participants" && (
          <ParticipantsPanel localUsername={session?.username} participants={participants} onClose={() => setPanel(null)} />
        )}
      </div>

      <div className="reactions-overlay">
        {reactions.map((r) => (
          <span key={r.id} className="floating-reaction">
            {r.emoji}
          </span>
        ))}
      </div>

      <Controls
        muted={muted}
        videoOff={videoOff}
        screenSharing={screenSharing}
        recording={recording}
        uploading={uploading}
        recordingSeconds={elapsedSec}
        participantCount={tiles.length + 1}
        onToggleAudio={() => setMuted(toggleAudio())}
        onToggleVideo={() => setVideoOff(toggleVideo())}
        onShareScreen={shareScreen}
        onStopScreenShare={stopScreenShare}
        onToggleRecording={handleToggleRecording}
        onToggleChat={() => setPanel((p) => (p === "chat" ? null : "chat"))}
        onToggleParticipants={() => setPanel((p) => (p === "participants" ? null : "participants"))}
        onLeave={handleLeave}
      />
    </div>
  );
}
