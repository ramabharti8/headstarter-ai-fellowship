import { NextRequest } from "next/server";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readJson, json } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { authenticateV1 } from "@/lib/v1-auth";
import { v1MessageSchema } from "@/lib/validation";
import { runChat } from "@/lib/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/v1/messages — send a message and get a reply.
 * `{ "sessionId", "message", "stream"? }`. With `stream: true` the response is a
 * text/event-stream; otherwise a JSON `{ reply, sessionId, citations }`.
 */
export async function POST(req: NextRequest) {
  try {
    const { orgId } = await authenticateV1(req);
    const { sessionId, message, stream } = await readJson(req, v1MessageSchema);

    const convo = await prisma.conversation.findFirst({ where: { id: sessionId, orgId } });
    if (!convo) throw Errors.notFound("Session not found");

    const { result, citations } = await runChat({
      orgId,
      conversationId: sessionId,
      userMessage: message,
      channel: Channel.API,
    });

    if (stream) return result.toTextStreamResponse();

    const reply = await result.text;
    return json({ reply, sessionId, citations });
  } catch (err) {
    if (err instanceof Error && err.message === "conversation_not_found") {
      return toErrorResponse(Errors.notFound("Session not found"));
    }
    return toErrorResponse(err);
  }
}
