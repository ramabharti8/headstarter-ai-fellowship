import { NextRequest } from "next/server";
import { Channel } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readJson, json } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { runChat } from "@/lib/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
});

// The widget is public: no API key. Abuse is bounded by a per-org + per-IP rate
// limit. For stricter control, add an allowed-origins check per organization.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw Errors.notFound("Unknown workspace");

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
    await enforceRateLimit(`widget:${orgId}:${ip}`, 20);

    const { message, sessionId } = await readJson(req, schema);

    let conversationId = sessionId;
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, orgId, channel: Channel.WIDGET },
        select: { id: true },
      });
      if (!existing) conversationId = undefined;
    }
    if (!conversationId) {
      const created = await prisma.conversation.create({
        data: { orgId, channel: Channel.WIDGET, title: "Widget chat" },
        select: { id: true },
      });
      conversationId = created.id;
    }

    const { result } = await runChat({
      orgId,
      conversationId,
      userMessage: message,
      channel: Channel.WIDGET,
    });

    const reply = await result.text;
    return json({ sessionId: conversationId, reply });
  } catch (err) {
    return toErrorResponse(err);
  }
}
