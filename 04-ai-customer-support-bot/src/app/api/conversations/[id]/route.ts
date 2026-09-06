import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/tenant";
import { readJson, json, noStore } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { updateConversationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { org } = await requireOrg();
    const { id } = await params;
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: org.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw Errors.notFound("Conversation not found");
    return json({ conversation }, noStore);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { org } = await requireOrg();
    const { id } = await params;
    const body = await readJson(req, updateConversationSchema);
    const existing = await prisma.conversation.findFirst({ where: { id, orgId: org.id } });
    if (!existing) throw Errors.notFound("Conversation not found");
    const conversation = await prisma.conversation.update({
      where: { id },
      data: { title: body.title, useKnowledge: body.useKnowledge },
      select: { id: true, title: true, useKnowledge: true, updatedAt: true },
    });
    return json({ conversation });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { org } = await requireOrg();
    const { id } = await params;
    const existing = await prisma.conversation.findFirst({ where: { id, orgId: org.id } });
    if (!existing) throw Errors.notFound("Conversation not found");
    await prisma.conversation.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
