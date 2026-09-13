import { useEffect, useRef } from "react";
import { MicOffIcon } from "./icons";

const AVATAR_PALETTE = ["#5b8cff", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];

function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export default function VideoTile({ stream, username, muted, videoOff, isLocal, speaking }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const displayName = username || "Guest";

  return (
    <div className={`video-tile ${speaking ? "speaking" : ""}`}>
      {!videoOff && stream ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} />
      ) : (
        <div className="video-tile-avatar-wrap">
          <div className="avatar-circle" style={{ background: colorFor(displayName) }}>
            {displayName[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div className="video-tile-label">
        <span className="video-tile-name">{displayName}</span>
        {muted && (
          <span className="muted-icon" title="Muted">
            <MicOffIcon width={14} height={14} />
          </span>
        )}
      </div>
    </div>
  );
}
