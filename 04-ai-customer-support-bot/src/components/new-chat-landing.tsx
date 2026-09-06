"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";

const SUGGESTIONS = [
  "Explain the difference between REST and GraphQL",
  "Write a Python function to debounce calls",
  "Draft a friendly reply to a refund request",
  "Summarize the key ideas of clean architecture",
];

export function NewChatLanding({ greetingName }: { greetingName?: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  async function start(text: string) {
    const t = text.trim();
    if (!t || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const { conversation } = await res.json();
      router.push(`/chat/${conversation.id}?q=${encodeURIComponent(t)}`);
    } catch {
      setError("Couldn't start a chat. Is the server running?");
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6">
      <h1 className="font-serif text-4xl text-foreground">
        {greetingName ? `Hello, ${greetingName.split(" ")[0]}` : "How can I help you today?"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask anything — code, writing, analysis, or questions about your knowledge base.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(input);
        }}
        className="mt-8 flex w-full items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50"
      >
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the assistant…"
          rows={1}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start(input);
            }
          }}
        />
        <button
          type="submit"
          disabled={starting || !input.trim()}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => start(s)}
            disabled={starting}
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:border-primary/40 hover:bg-accent"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
