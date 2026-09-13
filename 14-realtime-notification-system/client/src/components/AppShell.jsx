import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import NotificationPopupStack from "./NotificationPopupStack";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../hooks/useNotifications";
import { LogoutIcon } from "./icons";

export default function AppShell({ children }) {
  const { user, token, logout } = useAuth();
  const { notifications, unreadCount, popups, markRead, markAllRead, dismissPopup } = useNotifications({ token });

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-spacer" />
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} onMarkAllRead={markAllRead} />
          <div className="user-pill">
            <span className="avatar-circle">{user?.username?.[0]?.toUpperCase()}</span>
            {user?.username}
            <button className="icon-btn-plain" onClick={logout} title="Logout">
              <LogoutIcon width={16} height={16} />
            </button>
          </div>
        </header>
        <main className="app-content">
          {typeof children === "function"
            ? children({ notifications, unreadCount, markRead, markAllRead })
            : children}
        </main>
      </div>
      <NotificationPopupStack popups={popups} onDismiss={dismissPopup} />
    </div>
  );
}
