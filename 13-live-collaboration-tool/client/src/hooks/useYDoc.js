import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { io } from "socket.io-client";
import { BASE_URL } from "../lib/api";

function diffText(oldStr, newStr) {
  let prefix = 0;
  const maxPrefix = Math.min(oldStr.length, newStr.length);
  while (prefix < maxPrefix && oldStr[prefix] === newStr[prefix]) prefix++;

  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (oldEnd > prefix && newEnd > prefix && oldStr[oldEnd - 1] === newStr[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { start: prefix, deleteCount: oldEnd - prefix, insertText: newStr.slice(prefix, newEnd) };
}

/**
 * Binds a Yjs Y.Text CRDT to a plain <textarea> over Socket.IO signaling.
 * Local edits are diffed against the previous value and applied as Y.Text
 * ops; remote updates are applied via Y.applyUpdate and re-rendered.
 */
export function useYDoc({ docId, username, token, color, onEvent }) {
  const [text, setText] = useState("");
  const [presence, setPresence] = useState([]);
  const [connected, setConnected] = useState(false);
  const [cursors, setCursors] = useState(new Map()); // socketId -> { username, position }

  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const socketRef = useRef(null);
  const localValueRef = useRef(""); // last value we know the textarea holds
  const pendingSelectionRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    ydocRef.current = ydoc;
    ytextRef.current = ytext;

    ytext.observe(() => {
      const newValue = ytext.toString();
      localValueRef.current = newValue;
      setText(newValue);
    });

    ydoc.on("update", (update, origin) => {
      if (origin === "remote") return; // came from the server, don't echo back
      socketRef.current?.emit("doc_update", { docId, update: Array.from(update) });
    });

    const socket = io(BASE_URL || undefined, { transports: ["websocket"], auth: { token, color } });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_document", { docId, username, token });
    });

    socket.on("doc_sync", ({ state }) => {
      Y.applyUpdate(ydoc, new Uint8Array(state), "remote");
    });

    socket.on("doc_update", ({ update }) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), "remote");
    });

    socket.on("presence_update", ({ users }) => setPresence(users));

    socket.on("cursor_update", ({ socketId, username: remoteUsername, position }) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(socketId, { username: remoteUsername, position });
        return next;
      });
    });

    socket.on("collab_error", ({ message }) => onEvent?.({ type: "error", message }));
    socket.on("connect_error", (err) => onEvent?.({ type: "error", message: err.message }));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.emit("leave_document");
      socket.disconnect();
      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const applyLocalChange = useCallback((newValue, selectionStart) => {
    const ytext = ytextRef.current;
    const ydoc = ydocRef.current;
    if (!ytext || !ydoc) return;

    const oldValue = localValueRef.current;
    const { start, deleteCount, insertText } = diffText(oldValue, newValue);

    ydoc.transact(() => {
      if (deleteCount > 0) ytext.delete(start, deleteCount);
      if (insertText) ytext.insert(start, insertText);
    }, "local");

    localValueRef.current = newValue;
    pendingSelectionRef.current = selectionStart;
  }, []);

  const moveCursor = useCallback(
    (position) => {
      socketRef.current?.emit("cursor_move", { docId, position });
    },
    [docId]
  );

  const saveVersion = useCallback(
    (label) =>
      new Promise((resolve, reject) => {
        socketRef.current?.emit("save_version", { docId, label }, (ack) => {
          if (ack?.ok) resolve(ack.versionId);
          else reject(new Error(ack?.error || "Failed to save version"));
        });
      }),
    [docId]
  );

  const restoreVersion = useCallback(
    (versionId) => {
      socketRef.current?.emit("restore_version", { docId, versionId });
    },
    [docId]
  );

  return {
    text,
    applyLocalChange,
    pendingSelectionRef,
    presence,
    cursors,
    connected,
    moveCursor,
    saveVersion,
    restoreVersion,
  };
}
