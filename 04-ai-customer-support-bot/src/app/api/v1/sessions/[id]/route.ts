import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { authenticateV1 } from "@/lib/v1-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/v1/sessions/:id — end a session. Mirrors the original prototype. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await authenticateV1(req);
    const { id } = await params;
    const convo = await prisma.conversation.findFirst({ where: { id, orgId } });
    if (!convo) throw Errors.notFound("Session not found");
    await prisma.conversation.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
