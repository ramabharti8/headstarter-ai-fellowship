import { headers } from "next/headers";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { OrgForm } from "@/components/settings/org-form";
import { Members } from "@/components/settings/members";
import { ApiKeys } from "@/components/settings/api-keys";
import { WidgetSnippet } from "@/components/settings/widget-snippet";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { org } = await requireOrg();
  const canManage = org.role === "OWNER" || org.role === "ADMIN";
  const isOwner = org.role === "OWNER";

  const [full, memberships, invites, apiKeys] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: org.id } }),
    prisma.membership.findMany({
      where: { orgId: org.id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({ where: { orgId: org.id, acceptedAt: null } }),
    prisma.apiKey.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const h = await headers();
  const baseUrl =
    process.env.AUTH_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-8 py-10">
        <h1 className="font-serif text-2xl">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <OrgForm name={full.name} systemPrompt={full.systemPrompt} disabled={!canManage} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <Members
              canManage={canManage}
              isOwner={isOwner}
              members={memberships.map((m) => ({
                membershipId: m.id,
                name: m.user.name,
                email: m.user.email,
                role: m.role,
              }))}
              invites={invites.map((i) => ({ email: i.email, role: i.role }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiKeys
              canManage={canManage}
              keys={apiKeys.map((k) => ({
                id: k.id,
                name: k.name,
                prefix: k.prefix,
                lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                revokedAt: k.revokedAt?.toISOString() ?? null,
                createdAt: k.createdAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Embeddable widget</CardTitle>
          </CardHeader>
          <CardContent>
            <WidgetSnippet orgId={org.id} baseUrl={baseUrl} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
