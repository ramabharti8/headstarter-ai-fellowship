import { NavLink } from "react-router-dom";
import { GridIcon, SendIcon, HashIcon } from "./icons";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">S</span>
        <span>SignalBox</span>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <GridIcon width={18} height={18} />
          <span>Inbox</span>
        </NavLink>
        <NavLink to="/send" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <SendIcon width={18} height={18} />
          <span>Send</span>
        </NavLink>
        <NavLink to="/topics" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <HashIcon width={18} height={18} />
          <span>Topics</span>
        </NavLink>
      </nav>
    </aside>
  );
}
