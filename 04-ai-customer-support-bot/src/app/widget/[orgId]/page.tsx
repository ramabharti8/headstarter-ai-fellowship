import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { WidgetChat } from "@/components/widget-chat";

export const dynamic = "force-dynamic";

export default async function WidgetPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) notFound();
  return <WidgetChat orgId={orgId} orgName={org.name} />;
}
