"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Check, RefreshCw, Trash2, ArrowUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Citation {
  documentId: string;
  title: string;
  chunkIndex: number;
}

interface InitialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
}

const SUGGESTIONS = [
  "Explain the difference between REST and GraphQL",
  "Write a Python function to debounce calls",
  "Draft a friendly reply to a refund request",
  "Summarize the key ideas of clean architecture",
];

function textOf(message: UIMessage): string {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(getText());
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ChatView({
  conversationId,
  title,
  initialMessages,
  useKnowledge: initialUseKnowledge,
}: {
  conversationId: string;
  title: string;
  initialMessages: InitialMessage[];
  useKnowledge: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [useKnowledge, setUseKnowledge] = useState(initialUseKnowledge);
  const [input, setInput] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const autoSent = useRef(false);

  // Citations only exist for messages already persisted in the DB.
  const citationsById = useMemo(() => {
    const map = new Map<string, Citation[]>();
    for (const m of initialMessages) if (m.citations?.length) map.set(m.id, m.citations);
    return map;
  }, [initialMessages]);

  const initialUi = useMemo<UIMessage[]>(
    () =>
      initialMessages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text", text: m.content }],
      })),
    [initialMessages],
  );

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { conversationId } }),
    [conversationId],
  );

  const { messages, sendMessage, regenerate, status, error } = useChat({
    id: conversationId,
    messages: initialUi,
    transport,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-grow the textarea.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [input]);

  const busy = status === "streaming" || status === "submitted";

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setActionError(null);
    void sendMessage({ text: t });
  }

  // A chat started from the landing page carries the first message in `?q=`.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSent.current && initialMessages.length === 0) {
      autoSent.current = true;
      void sendMessage({ text: q });
      router.replace(`/chat/${conversationId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function toggleKnowledge() {
    const next = !useKnowledge;
    setUseKnowledge(next);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useKnowledge: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setUseKnowledge(!next);
      setActionError("Couldn't save that change. Is the server running?");
    }
  }

  async function deleteConversation() {
    if (!confirm("Delete this conversation?")) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/chat");
      router.refresh();
    } catch {
      setActionError("Couldn't delete this conversation. Is the server running?");
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border/70 px-6 py-3">
        <h1 className="truncate text-sm font-medium text-muted-foreground">{title}</h1>
        <div className="flex items-center gap-1">
          <label className="mr-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
            <input
              type="checkbox"
              checked={useKnowledge}
              onChange={toggleKnowledge}
              className="accent-primary"
            />
            Knowledge base
          </label>
          <Button variant="ghost" size="icon" onClick={deleteConversation} aria-label="Delete chat">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
            <h2 className="font-serif text-3xl text-foreground">How can I help you today?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask anything — code, writing, analysis, or questions about your knowledge base.
            </p>
            <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-8">
            {messages.map((m, i) => {
              const body = textOf(m);
              const cites = citationsById.get(m.id);
              const isLastAssistant = m.role === "assistant" && i === messages.length - 1 && !busy;
              return (
                <div key={m.id} className="group mb-7">
                  {m.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-[0.95rem] leading-relaxed text-foreground">
                        {body}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                        AI
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="prose-chat text-[0.95rem] text-foreground">
                          {body ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                          ) : (
                            <span className="inline-flex gap-1">
                              <Dot /> <Dot /> <Dot />
                            </span>
                          )}
                        </div>

                        {cites && cites.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cites.map((c, idx) => (
                              <span
                                key={c.documentId}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                <FileText className="h-3 w-3" />
                                <span className="font-medium text-foreground/80">[{idx + 1}]</span>
                                {c.title}
                              </span>
                            ))}
                          </div>
                        )}

                        {body && (
                          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <CopyButton getText={() => body} />
                            {isLastAssistant && (
                              <button
                                onClick={() => regenerate()}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {error && (
              <div className="mb-4 text-sm text-destructive">
                {error.message || "Something went wrong. Try again."}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        {actionError && <p className="mb-2 text-xs text-destructive">{actionError}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50"
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to the assistant…"
            rows={1}
            className="max-h-[220px] flex-1 resize-none bg-transparent px-2 py-2 text-[0.95rem] placeholder:text-muted-foreground focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />;
}
