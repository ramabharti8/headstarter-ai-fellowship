import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg, assertRole } from "@/lib/tenant";
import { json } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { deleteDocument } from "@/lib/ingest";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { org } = await requireOrg();
    assertRole(org.role, "ADMIN");
    const { id } = await params;
    const doc = await prisma.document.findFirst({ where: { id, orgId: org.id } });
    if (!doc) throw Errors.notFound("Document not found");
    await deleteDocument(org.id, id);
    return json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
