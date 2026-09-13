import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BASE_URL } from "../lib/api";

export function useWhiteboard({ boardId, username, token, color, onEvent }) {
  const [strokes, setStrokes] = useState([]);
  const [presence, setPresence] = useState([]);
  const [pointers, setPointers] = useState(new Map());
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(BASE_URL || undefined, { transports: ["websocket"], auth: { token, color } });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_whiteboard", { boardId, username, token });
    });

    socket.on("whiteboard_state", ({ strokes }) => setStrokes(strokes));
    socket.on("draw_stroke", ({ stroke }) => setStrokes((prev) => [...prev, stroke]));
    socket.on("whiteboard_cleared", () => setStrokes([]));
    socket.on("presence_update", ({ users }) => setPresence(users));
    socket.on("pointer_update", ({ socketId, username: remoteUsername, position }) => {
      setPointers((prev) => {
        const next = new Map(prev);
        next.set(socketId, { username: remoteUsername, position });
        return next;
      });
    });

    socket.on("connect_error", (err) => onEvent?.({ type: "error", message: err.message }));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.emit("leave_whiteboard");
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const addStroke = useCallback(
    (stroke) => {
      setStrokes((prev) => [...prev, stroke]);
      socketRef.current?.emit("draw_stroke", { boardId, stroke });
    },
    [boardId]
  );

  const clearBoard = useCallback(() => {
    setStrokes([]);
    socketRef.current?.emit("clear_whiteboard", { boardId });
  }, [boardId]);

  const movePointer = useCallback(
    (position) => {
      socketRef.current?.emit("pointer_move", { boardId, position });
    },
    [boardId]
  );

  return { strokes, presence, pointers, connected, addStroke, clearBoard, movePointer };
}
