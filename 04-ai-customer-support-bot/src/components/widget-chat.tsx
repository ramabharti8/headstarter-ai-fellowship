"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const KEY = (orgId: string) => `widget_session_${orgId}`;

export function WidgetChat({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionRef.current = localStorage.getItem(KEY(orgId));
    } catch {}
  }, [orgId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/widget/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sessionRef.current ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Error");
      sessionRef.current = data.sessionId;
      try {
        localStorage.setItem(KEY(orgId), data.sessionId);
      } catch {}
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-3 text-sm font-medium">
        {orgName} support
      </header>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">Hi! How can we help you today?</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={
                "inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card")
              }
            >
              {m.content}
            </span>
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">Typing…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
