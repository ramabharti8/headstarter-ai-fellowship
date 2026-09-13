import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { SendIcon } from "../components/icons";

const TYPES = ["info", "success", "warning", "error"];
const PRIORITIES = ["low", "normal", "high"];

export default function Send() {
  const { token } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [topics, setTopics] = useState([]);
  const [targetType, setTargetType] = useState("user");
  const [targetUserId, setTargetUserId] = useState("");
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [priority, setPriority] = useState("normal");
  const [channels, setChannels] = useState(["inapp"]);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (!token) return;
    api.listUsers(token).then(setUsers).catch(() => {});
    api.topics(token).then((r) => setTopics(r.topics)).catch(() => {});
  }, [token]);

  const toggleChannel = (ch) => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    if (targetType === "user" && !targetUserId) {
      toast.error("Choose a recipient.");
      return;
    }
    if (targetType === "topic" && !topic.trim()) {
      toast.error("Enter a topic.");
      return;
    }

    setSending(true);
    try {
      const result = await api.send(
        {
          targetType,
          targetUserId: targetType === "user" ? targetUserId : undefined,
          topic: targetType === "topic" ? topic.trim() : undefined,
          title: title.trim(),
          message: message.trim(),
          type,
          priority,
          channels,
        },
        token
      );
      setLastResult(result);
      toast.success(`Sent to ${result.recipientCount} recipient(s), ${result.deliveredCount} delivered live.`);
      setTitle("");
      setMessage("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <div className="page-inner">
        <div className="page-header-row">
          <div>
            <h1>Send a notification</h1>
            <p className="page-subtitle">Push it live to a user, a topic's subscribers, or everyone.</p>
          </div>
        </div>

        <div className="send-layout">
          <form className="card send-form" onSubmit={submit}>
            <label className="field-label">Target</label>
            <div className="segmented">
              {["user", "topic", "broadcast"].map((t) => (
                <button key={t} type="button" className={targetType === t ? "segment active" : "segment"} onClick={() => setTargetType(t)}>
                  {t === "user" ? "Specific user" : t === "topic" ? "Topic" : "Everyone"}
                </button>
              ))}
            </div>

            {targetType === "user" && (
              <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.username} ({u.email})
                  </option>
                ))}
              </select>
            )}

            {targetType === "topic" && (
              <>
                <input list="topic-options" placeholder="e.g. orders" value={topic} onChange={(e) => setTopic(e.target.value)} />
                <datalist id="topic-options">
                  {topics.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </>
            )}

            <label className="field-label">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Order #4821 shipped" />

            <label className="field-label">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your package is on its way…" rows={4} />

            <div className="two-col">
              <div>
                <label className="field-label">Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="field-label">Channels</label>
            <div className="checkbox-row">
              <label className="checkbox-pill">
                <input type="checkbox" checked={channels.includes("inapp")} onChange={() => toggleChannel("inapp")} />
                In-app
              </label>
              <label className="checkbox-pill">
                <input type="checkbox" checked={channels.includes("email")} onChange={() => toggleChannel("email")} />
                Email
              </label>
            </div>

            <button type="submit" className="primary-btn" disabled={sending}>
              <SendIcon width={16} height={16} />
              {sending ? "Sending…" : "Send notification"}
            </button>
          </form>

          {lastResult && (
            <div className="card result-card">
              <h3>Last send</h3>
              <div className="result-row">
                <span>Recipients</span>
                <strong>{lastResult.recipientCount}</strong>
              </div>
              <div className="result-row">
                <span>Delivered live</span>
                <strong>{lastResult.deliveredCount}</strong>
              </div>
              <div className="result-row">
                <span>Notification ID</span>
                <code>{lastResult.notificationId}</code>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
