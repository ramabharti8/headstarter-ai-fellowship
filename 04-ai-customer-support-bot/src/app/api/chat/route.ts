import { NextRequest } from "next/server";
import { z } from "zod";
import { Channel } from "@prisma/client";
import { requireOrg } from "@/lib/tenant";
import { readJson } from "@/lib/http";
import { toErrorResponse, Errors } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { runChat, maybeAutoTitle } from "@/lib/chat-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shape sent by the AI SDK's DefaultChatTransport (UI messages) plus our own body.
const bodySchema = z.object({
  conversationId: z.string().min(1),
  messages: z
    .array(
      z
        .object({
          role: z.string(),
          parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
        })
        .passthrough(),
    )
    .min(1),
});

function lastUserText(messages: z.infer<typeof bodySchema>["messages"]): string {
  const last = messages[messages.length - 1];
  if (last.role !== "user") return "";
  return last.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { org } = await requireOrg();
    await enforceRateLimit(`chat:${org.id}`, env.RATE_LIMIT_CHAT_PER_MINUTE);

    const { conversationId, messages } = await readJson(req, bodySchema);
    const text = lastUserText(messages);
    if (!text) throw Errors.badRequest("Last message must be non-empty text from the user");

    await maybeAutoTitle(conversationId, text);
    const { result } = await runChat({
      orgId: org.id,
      conversationId,
      userMessage: text,
      channel: Channel.WEB,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (err instanceof Error && err.message === "conversation_not_found") {
      return toErrorResponse(Errors.notFound("Conversation not found"));
    }
    return toErrorResponse(err);
  }
}
