import { CloseIcon, RestoreIcon } from "./icons";

export default function VersionHistoryPanel({ versions, onClose, onRestore, loading }) {
  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>Version history</span>
        <button className="icon-btn-plain" onClick={onClose} title="Close">
          <CloseIcon width={18} height={18} />
        </button>
      </div>
      <div className="version-list">
        {loading && <div className="chat-empty">Loading…</div>}
        {!loading && versions.length === 0 && <div className="chat-empty">No saved versions yet.</div>}
        {versions.map((v) => (
          <div key={v.id} className="version-row">
            <div className="version-row-main">
              <span className="version-label">{v.label === "auto" ? "Auto-saved" : "Saved"}</span>
              <span className="version-time">{new Date(v.createdAt).toLocaleString()}</span>
              <p className="version-preview">{v.plainTextPreview?.slice(0, 120) || "(empty)"}</p>
            </div>
            <button className="icon-link-btn" onClick={() => onRestore(v.id)} title="Restore this version">
              <RestoreIcon width={16} height={16} />
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
