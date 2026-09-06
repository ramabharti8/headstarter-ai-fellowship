import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { KnowledgePanel } from "@/components/knowledge-panel";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const { org } = await requireOrg();
  const documents = await prisma.document.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="font-serif text-2xl">Knowledge base</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Documents are chunked, embedded, and retrieved at answer time. Supported: .txt, .md, .pdf.
        </p>
        <div className="mt-6">
          <KnowledgePanel
            canManage={org.role === "OWNER" || org.role === "ADMIN"}
            initialDocs={documents.map((d) => ({
              id: d.id,
              title: d.title,
              sourceType: d.sourceType,
              byteSize: d.byteSize,
              status: d.status,
              error: d.error,
              chunkCount: d.chunkCount,
              createdAt: d.createdAt.toISOString(),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
