"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Upload, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { formatRelativeTime } from "@/lib/utils";

interface Doc {
  id: string;
  title: string;
  sourceType: string;
  byteSize: number;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

const statusVariant = {
  READY: "success",
  PROCESSING: "warning",
  PENDING: "muted",
  FAILED: "destructive",
} as const;

export function KnowledgePanel({
  initialDocs,
  canManage,
}: {
  initialDocs: Doc[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Upload failed");
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this document and its embeddings?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={upload}
          className="flex items-center gap-3 rounded-lg border border-border p-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.pdf"
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm"
          />
          <Button type="submit" disabled={uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? "Processing…" : "Upload"}
          </Button>
        </form>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {initialDocs.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">
            No documents yet. Upload help articles, FAQs, or policy docs and the bot will cite them.
          </li>
        )}
        {initialDocs.map((d) => (
          <li key={d.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">
                  {d.sourceType.toUpperCase()} · {(d.byteSize / 1024).toFixed(0)} KB ·{" "}
                  {d.chunkCount} chunks · {formatRelativeTime(d.createdAt)}
                  {d.status === "FAILED" && d.error ? ` · ${d.error}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={statusVariant[d.status]}>{d.status.toLowerCase()}</Badge>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(d.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
