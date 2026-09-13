import { useEffect, useRef, useState } from "react";
import { CloseIcon, SendIcon } from "./icons";

const QUICK_REACTIONS = ["👍", "🎉", "❤️", "😂", "👏", "🙌"];

export default function ChatPanel({ messages, onSend, onReact, onClose, currentUsername }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>In-call messages</span>
        <button className="icon-btn-plain" onClick={onClose} title="Close chat">
          <CloseIcon width={18} height={18} />
        </button>
      </div>

      <div className="chat-reactions">
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} onClick={() => onReact(emoji)} type="button">
            {emoji}
          </button>
        ))}
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <div className="chat-empty">No messages yet. Say hello!</div>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.username === currentUsername ? "own" : ""}`}>
            <div className="chat-message-meta">
              <strong>{m.username}</strong>
              <span>{new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="chat-message-text">{m.text}</div>
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
        <button type="submit" className="icon-btn-plain" disabled={!text.trim()} title="Send">
          <SendIcon width={18} height={18} />
        </button>
      </form>
    </div>
  );
}
