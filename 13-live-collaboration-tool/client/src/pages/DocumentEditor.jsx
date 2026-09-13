import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useYDoc } from "../hooks/useYDoc";
import { api } from "../lib/api";
import PresenceBar from "../components/PresenceBar";
import VersionHistoryPanel from "../components/VersionHistoryPanel";
import { CopyIcon, SaveIcon, HistoryIcon } from "../components/icons";

function guestIdentity() {
  let name = sessionStorage.getItem("sb_guest_name");
  let color = sessionStorage.getItem("sb_guest_color");
  if (!name) {
    name = `Guest-${Math.floor(Math.random() * 10000)}`;
    sessionStorage.setItem("sb_guest_name", name);
  }
  if (!color) {
    const palette = ["#6d8bff", "#8a6dff", "#34d399", "#f0a63a", "#ec4899", "#22d3ee"];
    color = palette[Math.floor(Math.random() * palette.length)];
    sessionStorage.setItem("sb_guest_color", color);
  }
  return { name, color };
}

export default function DocumentEditor() {
  const { docId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();
  const guest = useRef(guestIdentity()).current;

  const username = user?.username || guest.name;
  const color = user?.color || guest.color;

  const [title, setTitle] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    api.getDocument(docId).then((d) => setTitle(d.title)).catch(() => {});
  }, [docId]);

  const handleEvent = useCallback((event) => event.type === "error" && toast.error(event.message), [toast]);

  const { text, applyLocalChange, pendingSelectionRef, presence, cursors, connected, moveCursor, saveVersion, restoreVersion } =
    useYDoc({ docId, username, token, color, onEvent: handleEvent });

  // Restore cursor position after a text update we caused (remote updates just leave it be).
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && pendingSelectionRef.current != null) {
      ta.selectionStart = ta.selectionEnd = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
    }
  }, [text, pendingSelectionRef]);

  const onChange = (e) => {
    applyLocalChange(e.target.value, e.target.selectionStart);
  };

  const onSelect = (e) => {
    moveCursor(e.target.selectionStart);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveVersion = async () => {
    try {
      await saveVersion("manual");
      toast.success("Version saved.");
      if (showHistory) loadVersions();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const loadVersions = async () => {
    if (!token) {
      toast.error("Sign in to view version history.");
      return;
    }
    setLoadingVersions(true);
    try {
      setVersions(await api.documentVersions(docId, token));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingVersions(false);
    }
  };

  const toggleHistory = () => {
    setShowHistory((v) => {
      const next = !v;
      if (next) loadVersions();
      return next;
    });
  };

  const handleRestore = (versionId) => {
    restoreVersion(versionId);
    toast.success("Version restored.");
    setShowHistory(false);
  };

  const remoteCursorList = Array.from(cursors.values());

  return (
    <div className="editor-layout">
      <div className="editor-header">
        <div className="editor-header-left">
          <span className="doc-id-chip">{docId}</span>
          <input
            className="doc-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => token && api.renameDocument(docId, title, token).catch(() => {})}
            placeholder="Untitled document"
          />
          <span className={`connection-dot ${connected ? "online" : "offline"}`} title={connected ? "Connected" : "Reconnecting…"} />
        </div>
        <div className="editor-header-right">
          <PresenceBar users={presence} />
          <button className="icon-link-btn" onClick={copyLink} type="button">
            <CopyIcon width={16} height={16} />
            {copied ? "Copied" : "Share"}
          </button>
          <button className="icon-link-btn" onClick={handleSaveVersion} type="button">
            <SaveIcon width={16} height={16} />
            Save version
          </button>
          <button className="icon-link-btn" onClick={toggleHistory} type="button">
            <HistoryIcon width={16} height={16} />
            History
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-main">
          {remoteCursorList.length > 0 && (
            <div className="cursor-hint-row">
              {remoteCursorList.map((c, i) => (
                <span key={i} className="cursor-hint">
                  {c.username} @ {c.position}
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="doc-textarea"
            value={text}
            onChange={onChange}
            onSelect={onSelect}
            onKeyUp={onSelect}
            onClick={onSelect}
            placeholder="Start typing… everyone in this document sees your changes instantly."
            spellCheck={false}
          />
        </div>
        {showHistory && (
          <VersionHistoryPanel versions={versions} loading={loadingVersions} onClose={() => setShowHistory(false)} onRestore={handleRestore} />
        )}
      </div>
    </div>
  );
}
