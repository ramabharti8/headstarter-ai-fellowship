import { NextRequest } from "next/server";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readJson, json } from "@/lib/http";
import { toErrorResponse } from "@/lib/errors";
import { authenticateV1 } from "@/lib/v1-auth";
import { v1SessionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/sessions — create a conversation for programmatic use.
 * Mirrors the original prototype's `POST /api/chat/session`.
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await authenticateV1(req);
    const body = await readJson(req, v1SessionSchema).catch(() => ({}) as Record<string, never>);
    const conversation = await prisma.conversation.create({
      data: {
        orgId,
        channel: Channel.API,
        title: "API session",
        useKnowledge: (body as { useKnowledge?: boolean }).useKnowledge ?? true,
        endUserRef: (body as { endUserRef?: string }).endUserRef,
      },
      select: { id: true, createdAt: true },
    });
    return json({ sessionId: conversation.id, createdAt: conversation.createdAt }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
