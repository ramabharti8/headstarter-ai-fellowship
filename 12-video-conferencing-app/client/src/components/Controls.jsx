import {
  MicIcon,
  MicOffIcon,
  CameraIcon,
  CameraOffIcon,
  ScreenShareIcon,
  RecordIcon,
  StopIcon,
  MessageIcon,
  PhoneOffIcon,
  UsersIcon,
} from "./icons";

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Controls({
  muted,
  videoOff,
  screenSharing,
  recording,
  uploading,
  recordingSeconds,
  participantCount,
  onToggleAudio,
  onToggleVideo,
  onShareScreen,
  onStopScreenShare,
  onToggleRecording,
  onToggleChat,
  onToggleParticipants,
  onLeave,
}) {
  return (
    <div className="controls-bar">
      <div className="controls-left">
        {recording && (
          <span className="recording-pill">
            <span className="recording-dot" />
            REC {formatDuration(recordingSeconds)}
          </span>
        )}
      </div>

      <div className="controls-center">
        <button className={muted ? "control-btn active-danger" : "control-btn"} onClick={onToggleAudio} title={muted ? "Unmute" : "Mute"}>
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button className={videoOff ? "control-btn active-danger" : "control-btn"} onClick={onToggleVideo} title={videoOff ? "Turn camera on" : "Turn camera off"}>
          {videoOff ? <CameraOffIcon /> : <CameraIcon />}
        </button>
        <button
          className={screenSharing ? "control-btn active" : "control-btn"}
          onClick={screenSharing ? onStopScreenShare : onShareScreen}
          title="Share screen"
        >
          <ScreenShareIcon />
        </button>
        <button
          className={recording ? "control-btn active-danger" : "control-btn"}
          onClick={onToggleRecording}
          title={recording ? "Stop recording" : "Start recording"}
          disabled={uploading}
        >
          {recording ? <StopIcon /> : <RecordIcon />}
        </button>
        <button className="control-btn" onClick={onToggleChat} title="Chat">
          <MessageIcon />
        </button>
        <button className="control-btn leave-btn" onClick={onLeave} title="Leave call">
          <PhoneOffIcon />
        </button>
      </div>

      <div className="controls-right">
        <button className="control-btn control-btn-ghost" onClick={onToggleParticipants} title="Participants">
          <UsersIcon width={18} height={18} />
          <span>{participantCount}</span>
        </button>
      </div>
    </div>
  );
}
