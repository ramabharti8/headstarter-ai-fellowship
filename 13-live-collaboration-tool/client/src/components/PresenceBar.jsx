export default function PresenceBar({ users }) {
  return (
    <div className="presence-bar">
      {users.map((u) => (
        <div key={u.socketId} className="presence-chip" style={{ borderColor: u.color }} title={u.username}>
          <span className="presence-dot" style={{ background: u.color }} />
          {u.username}
        </div>
      ))}
      {users.length === 0 && <span className="presence-empty">Just you</span>}
    </div>
  );
}
