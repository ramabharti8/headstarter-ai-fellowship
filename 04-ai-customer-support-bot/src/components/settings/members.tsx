"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { inviteMember, removeMember, updateMemberRole } from "@/app/(app)/settings/actions";

interface MemberRow {
  membershipId: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}
interface InviteRow {
  email: string;
  role: string;
}

export function Members({
  members,
  invites,
  canManage,
  isOwner,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  canManage: boolean;
  isOwner: boolean;
}) {
  const [state, action, pending] = useActionState(inviteMember, {});

  return (
    <div className="space-y-4">
      {canManage && (
        <form action={action} className="flex items-end gap-2">
          <Input name="email" type="email" placeholder="teammate@company.com" required />
          <select
            name="role"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button type="submit" disabled={pending}>
            {pending ? "Inviting…" : "Invite"}
          </Button>
        </form>
      )}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">
          Invite created. Check the server logs for the link (no mail provider configured).
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.map((m) => (
          <li key={m.membershipId} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{m.name ?? m.email}</div>
              <div className="text-xs text-muted-foreground">{m.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && m.role !== "OWNER" ? (
                <form action={updateMemberRole} className="flex items-center gap-2">
                  <input type="hidden" name="membershipId" value={m.membershipId} />
                  <select
                    name="role"
                    defaultValue={m.role}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Update
                  </Button>
                </form>
              ) : (
                <span className="text-xs text-muted-foreground">{m.role}</span>
              )}
              {canManage && m.role !== "OWNER" && (
                <form action={removeMember}>
                  <input type="hidden" name="membershipId" value={m.membershipId} />
                  <Button type="submit" variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
              )}
            </div>
          </li>
        ))}
        {invites.map((i) => (
          <li
            key={i.email}
            className="flex items-center justify-between p-4 text-sm text-muted-foreground"
          >
            <span>{i.email} (invited)</span>
            <span className="text-xs">{i.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
