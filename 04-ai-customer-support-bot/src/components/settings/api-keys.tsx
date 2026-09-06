"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { createApiKey, revokeApiKey } from "@/app/(app)/settings/actions";
import { formatRelativeTime } from "@/lib/utils";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{value}</code>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function ApiKeys({ keys, canManage }: { keys: KeyRow[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(createApiKey, {});

  return (
    <div className="space-y-4">
      {canManage && (
        <form action={action} className="flex items-end gap-2">
          <Input name="name" placeholder="Key name (e.g. Production widget)" required />
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create key"}
          </Button>
        </form>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.secret && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="mb-2 text-sm font-medium">
            Copy your key now — it won&apos;t be shown again.
          </p>
          <CopyField value={state.secret} />
        </div>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {keys.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No API keys yet.</li>
        )}
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">
                {k.name} <code className="text-xs text-muted-foreground">{k.prefix}…</code>
              </div>
              <div className="text-xs text-muted-foreground">
                {k.revokedAt
                  ? `Revoked ${formatRelativeTime(k.revokedAt)}`
                  : k.lastUsedAt
                    ? `Last used ${formatRelativeTime(k.lastUsedAt)}`
                    : `Created ${formatRelativeTime(k.createdAt)} · never used`}
              </div>
            </div>
            {canManage && !k.revokedAt && (
              <form action={revokeApiKey}>
                <input type="hidden" name="id" value={k.id} />
                <Button type="submit" variant="outline" size="sm">
                  Revoke
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
