import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { HashIcon, PlusIcon, LogoutIcon, SearchIcon } from "./icons";

export default function Sidebar({ activeRoomId, onSelectRoom, presence }) {
  const { user, token, logout } = useAuth();
  const toast = useToast();

  const [publicRooms, setPublicRooms] = useState([]);
  const [dms, setDms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [search, setSearch] = useState("");

  const loadAll = async () => {
    try {
      const [rooms, dmList, users] = await Promise.all([api.publicRooms(token), api.myDms(token), api.listUsers(token)]);
      setPublicRooms(rooms);
      setDms(dmList);
      setAllUsers(users);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (token) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const createRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    try {
      const room = await api.createOrJoinPublicRoom(newRoomName.trim(), token);
      setNewRoomName("");
      setShowNewRoom(false);
      await loadAll();
      onSelectRoom({ roomId: room.roomId, type: "public", label: room.name });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const startDm = async (otherUser) => {
    try {
      const { roomId } = await api.openDm(otherUser._id, token);
      setShowUserPicker(false);
      await loadAll();
      onSelectRoom({ roomId, type: "dm", label: otherUser.username, otherUser });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filteredUsers = allUsers.filter((u) => u.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <span className="brand-mark">W</span>
          Wisp
        </div>
        <button className="icon-btn-plain" onClick={logout} title="Logout">
          <LogoutIcon width={17} height={17} />
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Rooms</span>
          <button className="icon-btn-plain" onClick={() => setShowNewRoom((v) => !v)} title="New room">
            <PlusIcon width={15} height={15} />
          </button>
        </div>
        {showNewRoom && (
          <form className="inline-form" onSubmit={createRoom}>
            <input placeholder="room-name" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} autoFocus />
          </form>
        )}
        <div className="conversation-list">
          {publicRooms.map((r) => (
            <button
              key={r.roomId}
              className={`conversation-row ${activeRoomId === r.roomId ? "active" : ""}`}
              onClick={() => onSelectRoom({ roomId: r.roomId, type: "public", label: r.name })}
            >
              <span className="room-hash">
                <HashIcon width={15} height={15} />
              </span>
              <span className="conversation-label">{r.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Direct messages</span>
          <button className="icon-btn-plain" onClick={() => setShowUserPicker((v) => !v)} title="New DM">
            <PlusIcon width={15} height={15} />
          </button>
        </div>

        {showUserPicker && (
          <div className="user-picker">
            <div className="input-with-icon">
              <SearchIcon width={14} height={14} />
              <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            </div>
            <div className="user-picker-list">
              {filteredUsers.map((u) => (
                <button key={u._id} className="user-picker-row" onClick={() => startDm(u)}>
                  <span className="avatar-circle" style={{ background: u.color }}>
                    {u.username[0]?.toUpperCase()}
                  </span>
                  {u.username}
                  {presence.get(u._id)?.online && <span className="online-dot" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="conversation-list">
          {dms.map((d) => {
            const isOnline = d.otherUser && presence.has(d.otherUser._id) ? presence.get(d.otherUser._id).online : d.otherUser?.online;
            return (
              <button
                key={d.roomId}
                className={`conversation-row ${activeRoomId === d.roomId ? "active" : ""}`}
                onClick={() => onSelectRoom({ roomId: d.roomId, type: "dm", label: d.otherUser?.username, otherUser: d.otherUser })}
              >
                <span className="avatar-circle avatar-sm" style={{ background: d.otherUser?.color }}>
                  {d.otherUser?.username?.[0]?.toUpperCase()}
                </span>
                <span className="conversation-label">{d.otherUser?.username}</span>
                {isOnline && <span className="online-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <span className="avatar-circle" style={{ background: user?.color }}>
          {user?.username?.[0]?.toUpperCase()}
        </span>
        <span>{user?.username}</span>
      </div>
    </aside>
  );
}
