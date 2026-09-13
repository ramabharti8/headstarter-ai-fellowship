import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BASE_URL } from "../lib/api";
import { api } from "../lib/api";

export function useChat({ token, userId }) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState(new Map()); // userId -> { online, lastSeen }
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [roomError, setRoomError] = useState(null);

  const socketRef = useRef(null);
  const activeRoomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(BASE_URL || undefined, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("authenticate", { token });
    });

    // Re-join whatever room was open whenever we (re)authenticate — this covers
    // the initial connect and, importantly, any later reconnect (server
    // restart, network blip): Socket.IO room membership doesn't survive a
    // dropped connection, so without this, messages/typing keep working for
    // a fresh room selection but silently stop for the room already open.
    socket.on("authenticated", () => {
      if (activeRoomRef.current) socket.emit("join_room", { roomId: activeRoomRef.current });
    });

    socket.on("presence_update", ({ userId: uid, online, lastSeen }) => {
      setPresence((prev) => {
        const next = new Map(prev);
        next.set(uid, { online, lastSeen });
        return next;
      });
    });

    socket.on("receive_message", (message) => {
      if (message.roomId === activeRoomRef.current) {
        setMessages((prev) => [...prev, message]);
      }
    });

    socket.on("user_typing", ({ roomId, username }) => {
      if (roomId === activeRoomRef.current) {
        setTypingUsers((prev) => new Set(prev).add(username));
      }
    });

    socket.on("user_stopped_typing", ({ roomId, username }) => {
      if (roomId === activeRoomRef.current) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(username);
          return next;
        });
      }
    });

    socket.on("read_receipt", ({ roomId, messageId, userId: reader }) => {
      if (roomId === activeRoomRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, readBy: [...new Set([...(m.readBy || []), reader])] } : m))
        );
      }
    });

    socket.on("room_error", ({ message }) => setRoomError(message));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const joinRoom = useCallback(
    async (roomId) => {
      if (activeRoomRef.current === roomId) return;
      if (activeRoomRef.current) socketRef.current?.emit("leave_room", { roomId: activeRoomRef.current });

      activeRoomRef.current = roomId;
      setActiveRoomId(roomId);
      setMessages([]);
      setTypingUsers(new Set());
      setRoomError(null);

      socketRef.current?.emit("join_room", { roomId });
      try {
        const history = await api.history(roomId, token);
        if (activeRoomRef.current === roomId) setMessages(history);
      } catch (err) {
        setRoomError(err.message);
      }
    },
    [token]
  );

  const sendMessage = useCallback((text, attachment) => {
    const roomId = activeRoomRef.current;
    if (!roomId) return;
    socketRef.current?.emit("send_message", { roomId, text, attachment });
  }, []);

  const setTyping = useCallback((isTyping) => {
    const roomId = activeRoomRef.current;
    if (!roomId) return;
    socketRef.current?.emit(isTyping ? "typing" : "stop_typing", { roomId });

    if (isTyping) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit("stop_typing", { roomId });
      }, 3000);
    }
  }, []);

  const markRead = useCallback((messageId) => {
    const roomId = activeRoomRef.current;
    if (!roomId) return;
    socketRef.current?.emit("mark_read", { roomId, messageId });
  }, []);

  // Mark unread messages from others as read once they're rendered in the active room.
  useEffect(() => {
    if (!userId) return;
    messages.forEach((m) => {
      const senderId = m.senderId?._id || m.senderId;
      if (senderId !== userId && !(m.readBy || []).includes(userId)) {
        markRead(m._id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, userId]);

  return {
    connected,
    presence,
    activeRoomId,
    messages,
    typingUsers,
    roomError,
    joinRoom,
    sendMessage,
    setTyping,
    markRead,
  };
}
