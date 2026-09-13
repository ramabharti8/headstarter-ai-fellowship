import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useChat } from "../hooks/useChat";
import Sidebar from "../components/Sidebar";
import MessageBubble from "../components/MessageBubble";
import Composer from "../components/Composer";
import { HashIcon, MessageCircleIcon } from "../components/icons";

function formatLastSeen(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Chat() {
  const { user, token } = useAuth();
  const toast = useToast();
  const [conversation, setConversation] = useState(null); // { roomId, type, label, otherUser }
  const scrollRef = useRef(null);

  const { connected, presence, activeRoomId, messages, typingUsers, roomError, joinRoom, sendMessage, setTyping } = useChat({
    token,
    userId: user?._id,
  });

  useEffect(() => {
    if (roomError) toast.error(roomError);
  }, [roomError, toast]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSelectRoom = (conv) => {
    setConversation(conv);
    joinRoom(conv.roomId);
  };

  const handleSend = (text, attachment) => {
    sendMessage(text, attachment);
  };

  const otherPresence = conversation?.otherUser ? presence.get(conversation.otherUser._id) || conversation.otherUser : null;

  return (
    <div className="chat-shell">
      <Sidebar activeRoomId={activeRoomId} onSelectRoom={handleSelectRoom} presence={presence} />

      <div className="chat-main">
        {!conversation ? (
          <div className="chat-empty-state">
            <MessageCircleIcon width={40} height={40} />
            <p>Pick a room or a direct message to start chatting.</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div className="chat-header-title">
                {conversation.type === "public" ? (
                  <>
                    <HashIcon width={17} height={17} />
                    {conversation.label}
                  </>
                ) : (
                  <>
                    <span className="avatar-circle avatar-sm" style={{ background: conversation.otherUser?.color }}>
                      {conversation.label?.[0]?.toUpperCase()}
                    </span>
                    {conversation.label}
                  </>
                )}
              </div>
              {conversation.type === "dm" && (
                <span className="chat-header-status">
                  {otherPresence?.online ? (
                    <>
                      <span className="online-dot" /> Online
                    </>
                  ) : (
                    `Last seen ${formatLastSeen(otherPresence?.lastSeen)}`
                  )}
                </span>
              )}
              {!connected && <span className="connection-warning">Reconnecting…</span>}
            </div>

            <div className="message-list" ref={scrollRef}>
              {messages.map((m, i) => {
                const senderId = m.senderId?._id || m.senderId;
                const isOwn = senderId === user?._id;
                const prev = messages[i - 1];
                const showSender = conversation.type === "public" && (!prev || (prev.senderId?._id || prev.senderId) !== senderId);
                const readByOthers = (m.readBy || []).some((id) => id !== senderId);
                return (
                  <MessageBubble key={m._id} message={m} isOwn={isOwn} showSender={showSender} readByOthers={readByOthers} />
                );
              })}
              {typingUsers.size > 0 && (
                <div className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  {Array.from(typingUsers).join(", ")} typing…
                </div>
              )}
            </div>

            <Composer onSend={handleSend} onTyping={setTyping} />
          </>
        )}
      </div>
    </div>
  );
}
