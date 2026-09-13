import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { BellIcon, CheckAllIcon } from "./icons";
import { typeMeta } from "./notificationMeta";

export default function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const recent = notifications.slice(0, 6);

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen((v) => !v)}>
        <BellIcon />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button className="text-link" onClick={onMarkAllRead}>
                <CheckAllIcon width={14} height={14} />
                Mark all read
              </button>
            )}
          </div>
          <div className="bell-dropdown-list">
            {recent.length === 0 && <div className="empty-hint">You're all caught up.</div>}
            {recent.map((n) => {
              const meta = typeMeta(n.type);
              return (
                <div key={n._id} className={`bell-item ${n.read ? "" : "unread"}`} onClick={() => !n.read && onMarkRead(n._id)}>
                  <span className="bell-item-icon" style={{ color: meta.color }}>
                    <meta.Icon width={16} height={16} />
                  </span>
                  <div className="bell-item-body">
                    <div className="bell-item-title">{n.title}</div>
                    <div className="bell-item-message">{n.message}</div>
                  </div>
                  {!n.read && <span className="unread-dot" />}
                </div>
              );
            })}
          </div>
          <Link to="/" className="bell-dropdown-footer" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
