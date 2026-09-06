import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let data;
  try {
    data = await requireOrg();
  } catch {
    redirect("/sign-in");
  }

  const conversations = await prisma.conversation.findMany({
    where: { orgId: data.org.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <AppShell
      org={data.org}
      userName={data.user.name ?? data.user.email}
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
    >
      {children}
    </AppShell>
  );
}
