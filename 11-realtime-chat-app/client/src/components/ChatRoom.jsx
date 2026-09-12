import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatRoom({ username, room, onLeave }) {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(socket.connected);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    socket.connect();
    socket.emit("join_room", { username, room });

    function handleConnect() {
      setConnected(true);
    }
    function handleDisconnect() {
      setConnected(false);
    }
    function handleReceiveMessage(payload) {
      setMessages((prev) => [...prev, { ...payload, kind: "message" }]);
    }
    function handleUserJoined({ username: joinedName, timestamp }) {
      if (joinedName === username) return;
      setMessages((prev) => [
        ...prev,
        { id: `join-${timestamp}-${joinedName}`, kind: "system", text: `${joinedName} joined the room`, timestamp },
      ]);
    }
    function handleUserLeft({ username: leftName, timestamp }) {
      setMessages((prev) => [
        ...prev,
        { id: `left-${timestamp}-${leftName}`, kind: "system", text: `${leftName} left the room`, timestamp },
      ]);
    }
    function handleRoomUsers({ users: roomUsers }) {
      setUsers(roomUsers);
    }
    function handleUserTyping({ username: typingName }) {
      if (typingName === username) return;
      setTypingUsers((prev) => (prev.includes(typingName) ? prev : [...prev, typingName]));
    }
    function handleUserStoppedTyping({ username: typingName }) {
      setTypingUsers((prev) => prev.filter((name) => name !== typingName));
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("room_users", handleRoomUsers);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stopped_typing", handleUserStoppedTyping);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("room_users", handleRoomUsers);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stopped_typing", handleUserStoppedTyping);
      socket.disconnect();
    };
  }, [username, room]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socket.emit("send_message", { room, message: text });
    socket.emit("stop_typing", { room, username });
    clearTimeout(typingTimeoutRef.current);
    setDraft("");
  }

  function handleDraftChange(e) {
    setDraft(e.target.value);
    socket.emit("typing", { room, username });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", { room, username });
    }, 1500);
  }

  function handleLeave() {
    socket.disconnect();
    onLeave();
  }

  return (
    <div className="chat-screen">
      <aside className="sidebar">
        <div>
          <h2>#{room}</h2>
          <span className={`status ${connected ? "online" : "offline"}`}>
            {connected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
        <h3>Online ({users.length})</h3>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u} className={u === username ? "me" : ""}>
              {u}
              {u === username ? " (you)" : ""}
            </li>
          ))}
        </ul>
        <button className="leave-btn" onClick={handleLeave}>
          Leave room
        </button>
      </aside>

      <main className="chat-main">
        <div className="messages">
          {messages.map((m) =>
            m.kind === "system" ? (
              <div key={m.id} className="system-message">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className={`message ${m.username === username ? "mine" : ""}`}>
                <div className="message-meta">
                  <span className="message-author">{m.username}</span>
                  <span className="message-time">{formatTime(m.timestamp)}</span>
                </div>
                <div className="message-bubble">{m.message}</div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </div>
        )}

        <form className="composer" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMessage(e);
              }
            }}
            placeholder="Type a message..."
            maxLength={500}
            autoFocus
          />
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
