"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WidgetSnippet({ orgId, baseUrl }: { orgId: string; baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${baseUrl}/widget.js" data-org="${orgId}" async></script>`;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Paste this before <code className="text-xs">&lt;/body&gt;</code> on your site. It injects a
        floating chat bubble backed by this org&apos;s bot and knowledge base.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{snippet}</code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
