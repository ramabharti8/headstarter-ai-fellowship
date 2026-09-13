import { useEffect, useRef, useState } from "react";
import { MicIcon, MicOffIcon, CameraIcon, CameraOffIcon, CopyIcon } from "./icons";

export default function Lobby({ roomId, defaultUsername, onJoin, onError }) {
  const [stream, setStream] = useState(null);
  const [requestingMedia, setRequestingMedia] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [username, setUsername] = useState(defaultUsername || "");
  const [copied, setCopied] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let acquired = null;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = s;
        setStream(s);
      })
      .catch((err) => onError?.(err.message))
      .finally(() => {
        if (!cancelled) setRequestingMedia(false);
      });

    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const toggleMic = () => {
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCam = () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/room/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const join = (e) => {
    e.preventDefault();
    onJoin(username.trim() || `Guest-${Math.floor(Math.random() * 10000)}`, stream);
  };

  return (
    <div className="lobby">
      <div className="lobby-inner">
        <div className="lobby-preview">
          {camOn && stream ? (
            <video ref={videoRef} autoPlay muted playsInline />
          ) : (
            <div className="lobby-preview-placeholder">
              <div className="avatar-circle avatar-lg">{(username || "?")[0]?.toUpperCase()}</div>
            </div>
          )}
          <div className="lobby-preview-controls">
            <button
              className={micOn ? "control-btn" : "control-btn active-danger"}
              onClick={toggleMic}
              type="button"
              title="Toggle microphone"
              disabled={!stream}
            >
              {micOn ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              className={camOn ? "control-btn" : "control-btn active-danger"}
              onClick={toggleCam}
              type="button"
              title="Toggle camera"
              disabled={!stream}
            >
              {camOn ? <CameraIcon /> : <CameraOffIcon />}
            </button>
          </div>
        </div>

        <div className="lobby-panel">
          <h1>Ready to join?</h1>
          <p className="lobby-room-id">
            Room <strong>{roomId}</strong>
            <button className="icon-link-btn" onClick={copyLink} type="button" title="Copy invite link">
              <CopyIcon width={16} height={16} />
              {copied ? "Copied" : "Copy link"}
            </button>
          </p>

          <form onSubmit={join} className="stacked-form">
            <label className="field-label">Your name</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your name" autoFocus />
            <button type="submit" className="primary-btn" disabled={requestingMedia}>
              {requestingMedia ? "Setting up camera…" : stream ? "Join now" : "Join without camera/mic"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
