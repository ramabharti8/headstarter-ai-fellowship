import { useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { SendIcon, PaperclipIcon, CloseIcon, FileIcon } from "./icons";

export default function Composer({ onSend, onTyping }) {
  const { token } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !pendingFile) return;

    let attachment = null;
    if (pendingFile) {
      setUploading(true);
      try {
        attachment = await api.upload(pendingFile, token);
      } catch (err) {
        toast.error(err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(text.trim(), attachment);
    setText("");
    setPendingFile(null);
    onTyping(false);
  };

  return (
    <form className="composer" onSubmit={submit}>
      {pendingFile && (
        <div className="pending-attachment">
          <FileIcon width={16} height={16} />
          <span>{pendingFile.name}</span>
          <button type="button" onClick={() => setPendingFile(null)}>
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}
      <div className="composer-row">
        <input type="file" ref={fileInputRef} hidden onChange={handleFilePick} />
        <button type="button" className="icon-btn-plain" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <PaperclipIcon width={19} height={19} />
        </button>
        <input
          className="composer-input"
          placeholder="Message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping(true);
          }}
          onBlur={() => onTyping(false)}
        />
        <button type="submit" className="send-btn" disabled={uploading || (!text.trim() && !pendingFile)}>
          <SendIcon width={17} height={17} />
        </button>
      </div>
    </form>
  );
}
