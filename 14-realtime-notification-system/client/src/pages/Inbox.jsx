import { useState } from "react";
import AppShell from "../components/AppShell";
import { typeMeta } from "../components/notificationMeta";
import { CheckAllIcon, HashIcon } from "../components/icons";

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Inbox() {
  const [filter, setFilter] = useState("all");

  return (
    <AppShell>
      {({ notifications, markRead, markAllRead, unreadCount }) => {
        const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

        return (
          <div className="page-inner">
            <div className="page-header-row">
              <div>
                <h1>Inbox</h1>
                <p className="page-subtitle">Everything sent to you, in real time.</p>
              </div>
              {unreadCount > 0 && (
                <button className="secondary-btn" onClick={markAllRead}>
                  <CheckAllIcon width={16} height={16} />
                  Mark all read
                </button>
              )}
            </div>

            <div className="tab-row">
              <button className={filter === "all" ? "tab active" : "tab"} onClick={() => setFilter("all")}>
                All
              </button>
              <button className={filter === "unread" ? "tab active" : "tab"} onClick={() => setFilter("unread")}>
                Unread {unreadCount > 0 && `(${unreadCount})`}
              </button>
            </div>

            <div className="notification-list">
              {visible.length === 0 && <div className="empty-state">Nothing here yet.</div>}
              {visible.map((n) => {
                const meta = typeMeta(n.type);
                return (
                  <div key={n._id} className={`notification-row ${n.read ? "" : "unread"}`} onClick={() => !n.read && markRead(n._id)}>
                    <span className="notification-icon" style={{ color: meta.color, background: `${meta.color}1a` }}>
                      <meta.Icon width={18} height={18} />
                    </span>
                    <div className="notification-body">
                      <div className="notification-top-row">
                        <span className="notification-title">{n.title}</span>
                        <span className="notification-time">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="notification-message">{n.message}</p>
                      {n.topic && (
                        <span className="topic-chip">
                          <HashIcon width={12} height={12} />
                          {n.topic}
                        </span>
                      )}
                    </div>
                    {!n.read && <span className="unread-dot" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }}
    </AppShell>
  );
}
