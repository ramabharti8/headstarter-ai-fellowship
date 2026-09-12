import { useState } from "react";
import JoinForm from "./components/JoinForm";
import ChatRoom from "./components/ChatRoom";
import "./App.css";

const SESSION_KEY = "chat-session";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState(loadSession);

  function handleJoin(username, room) {
    const next = { username, room };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
    setSession(next);
  }

  function handleLeave() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore storage errors
    }
    setSession(null);
  }

  if (!session) {
    return <JoinForm onJoin={handleJoin} />;
  }

  return <ChatRoom username={session.username} room={session.room} onLeave={handleLeave} />;
}
