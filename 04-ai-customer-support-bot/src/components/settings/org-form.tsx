"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/primitives";
import { updateOrgSettings } from "@/app/(app)/settings/actions";

export function OrgForm({
  name,
  systemPrompt,
  disabled,
}: {
  name: string;
  systemPrompt: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateOrgSettings, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" name="name" defaultValue={name} disabled={disabled} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="systemPrompt">System prompt</Label>
        <Textarea
          id="systemPrompt"
          name="systemPrompt"
          defaultValue={systemPrompt}
          rows={6}
          disabled={disabled}
          required
        />
        <p className="text-xs text-muted-foreground">
          Sets the agent&apos;s persona and rules. Applied to every conversation in this org.
        </p>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      {!disabled && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      )}
    </form>
  );
}
