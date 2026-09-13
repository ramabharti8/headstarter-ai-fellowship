import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { HashIcon, MailIcon } from "../components/icons";

export default function Topics() {
  const { token, user, refreshUser } = useAuth();
  const toast = useToast();

  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [customTopic, setCustomTopic] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.topics(token).then((r) => setAvailable(r.topics)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (user) {
      setSelected(user.topics || []);
      setEmailNotifications(user.emailNotifications);
    }
  }, [user]);

  const toggleTopic = (topic) => {
    setSelected((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  };

  const addCustomTopic = (e) => {
    e.preventDefault();
    const t = customTopic.trim().toLowerCase();
    if (!t || selected.includes(t)) return;
    setSelected((prev) => [...prev, t]);
    setCustomTopic("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateTopics(selected, token);
      await api.updatePreferences({ emailNotifications }, token);
      await refreshUser();
      toast.success("Preferences saved.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const allTopics = Array.from(new Set([...available, ...selected]));

  return (
    <AppShell>
      <div className="page-inner">
        <div className="page-header-row">
          <div>
            <h1>Topics & preferences</h1>
            <p className="page-subtitle">Choose what you want to hear about, and how.</p>
          </div>
          <button className="primary-btn" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <div className="card">
          <h3>
            <HashIcon width={16} height={16} /> Subscribed topics
          </h3>
          <div className="topic-grid">
            {allTopics.map((t) => (
              <label key={t} className={`topic-toggle ${selected.includes(t) ? "on" : ""}`}>
                <input type="checkbox" checked={selected.includes(t)} onChange={() => toggleTopic(t)} />
                #{t}
              </label>
            ))}
          </div>
          <form className="inline-add-form" onSubmit={addCustomTopic}>
            <input placeholder="Add a custom topic…" value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} />
            <button type="submit" className="secondary-btn">
              Add
            </button>
          </form>
        </div>

        <div className="card">
          <h3>
            <MailIcon width={16} height={16} /> Delivery channels
          </h3>
          <label className="switch-row">
            <span>Email notifications</span>
            <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} />
          </label>
          <p className="hint-text">When a sender includes the email channel, you'll also get an email if this is on.</p>
        </div>
      </div>
    </AppShell>
  );
}
