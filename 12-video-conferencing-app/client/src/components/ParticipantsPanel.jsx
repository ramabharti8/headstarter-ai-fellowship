import { CloseIcon, MicOffIcon, CameraOffIcon } from "./icons";

export default function ParticipantsPanel({ localUsername, participants, onClose }) {
  const list = Array.from(participants.entries());

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Participants ({list.length + 1})</span>
        <button className="icon-btn-plain" onClick={onClose} title="Close">
          <CloseIcon width={18} height={18} />
        </button>
      </div>
      <div className="participants-list">
        <div className="participant-row">
          <span>{localUsername} (You)</span>
        </div>
        {list.map(([socketId, p]) => (
          <div key={socketId} className="participant-row">
            <span>{p.username}</span>
            <span className="participant-badges">
              {p.muted && <MicOffIcon width={14} height={14} />}
              {p.videoOff && <CameraOffIcon width={14} height={14} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
