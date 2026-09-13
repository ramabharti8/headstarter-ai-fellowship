import { CheckIcon, CheckAllIcon, FileIcon } from "./icons";
import { BASE_URL } from "../lib/api";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isImage(mimeType) {
  return mimeType?.startsWith("image/");
}

export default function MessageBubble({ message, isOwn, showSender, readByOthers }) {
  const senderName = message.senderId?.username || "Unknown";
  const senderColor = message.senderId?.color || "#14b8a6";

  return (
    <div className={`message-row ${isOwn ? "own" : ""}`}>
      {!isOwn && (
        <span className="avatar-circle avatar-sm message-avatar" style={{ background: senderColor }}>
          {senderName[0]?.toUpperCase()}
        </span>
      )}
      <div className="message-bubble">
        {showSender && !isOwn && <div className="message-sender">{senderName}</div>}

        {message.attachment && (
          <div className="message-attachment">
            {isImage(message.attachment.mimeType) ? (
              <img src={`${BASE_URL}${message.attachment.url}`} alt={message.attachment.name} />
            ) : (
              <a href={`${BASE_URL}${message.attachment.url}`} target="_blank" rel="noreferrer" className="file-attachment">
                <FileIcon width={18} height={18} />
                <span>{message.attachment.name}</span>
              </a>
            )}
          </div>
        )}

        {message.text && <div className="message-text">{message.text}</div>}

        <div className="message-meta">
          <span>{formatTime(message.createdAt)}</span>
          {isOwn && (
            <span className={readByOthers ? "read-tick read" : "read-tick"}>
              {readByOthers ? <CheckAllIcon width={14} height={14} /> : <CheckIcon width={14} height={14} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
