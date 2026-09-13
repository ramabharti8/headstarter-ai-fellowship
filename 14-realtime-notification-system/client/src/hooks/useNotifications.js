import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BASE_URL } from "../lib/api";
import { api } from "../lib/api";

export function useNotifications({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [popups, setPopups] = useState([]);
  const socketRef = useRef(null);

  const loadInitial = useCallback(async () => {
    if (!token) return;
    try {
      const [list, { count }] = await Promise.all([api.myNotifications(token, 30), api.unreadCount(token)]);
      setNotifications(list);
      setUnreadCount(count);
    } catch {
      /* handled elsewhere via connection status */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    loadInitial();

    const socket = io(BASE_URL || undefined, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("authenticate", { token });
    });

    socket.on("notification", (notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + 1);

      const popupId = `${notification._id || notification.notificationId}-${Date.now()}`;
      setPopups((prev) => [...prev, { ...notification, popupId }]);
      setTimeout(() => setPopups((prev) => prev.filter((p) => p.popupId !== popupId)), 6000);
    });

    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.disconnect();
    };
  }, [token, loadInitial]);

  const markRead = useCallback(
    async (id) => {
      if (!id) return;
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      socketRef.current?.emit("acknowledge", { id });
      try {
        await api.markRead(id, token);
      } catch {
        /* optimistic update already applied; a retry/refresh will reconcile */
      }
    },
    [token]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllRead(token);
    } catch {
      /* ignore; next loadInitial() reconciles */
    }
  }, [token]);

  const dismissPopup = useCallback((popupId) => {
    setPopups((prev) => prev.filter((p) => p.popupId !== popupId));
  }, []);

  return { notifications, unreadCount, connected, popups, markRead, markAllRead, dismissPopup, refresh: loadInitial };
}
