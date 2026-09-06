import { streamText } from "ai";
import { Channel, MessageRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { chatModel } from "@/lib/ai/provider";
import { buildSystemPrompt, trimHistory, toModelMessages } from "@/lib/ai/prompt";
import { retrieveContext, formatContextBlock, citationsFrom, type Citation } from "@/lib/ai/rag";

export interface RunChatArgs {
  orgId: string;
  conversationId: string;
  /** The new user message to answer. */
  userMessage: string;
  channel: Channel;
}

export interface RunChatResult {
  result: ReturnType<typeof streamText>;
  citations: Citation[];
}

/**
 * Core chat pipeline shared by the web UI (`/api/chat`) and the public API
 * (`/api/v1/messages`): load history, optionally retrieve knowledge-base
 * context, stream a completion, and persist both messages + a usage event.
 */
export async function runChat({
  orgId,
  conversationId,
  userMessage,
  channel,
}: RunChatArgs): Promise<RunChatResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      org: { select: { systemPrompt: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 40 },
    },
  });
  if (!conversation) throw new Error("conversation_not_found");

  const priorHistory = conversation.messages
    .filter((m) => m.role !== MessageRole.system)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Retrieval
  let contextBlock: string | undefined;
  let citations: Citation[] = [];
  let retrievedDocs = 0;
  if (conversation.useKnowledge) {
    try {
      const chunks = await retrieveContext(orgId, userMessage);
      if (chunks.length > 0) {
        contextBlock = formatContextBlock(chunks);
        citations = citationsFrom(chunks);
        retrievedDocs = citations.length;
      }
    } catch (err) {
      logger.warn({ err, conversationId }, "knowledge retrieval failed; answering without context");
    }
  }

  const system = buildSystemPrompt({
    orgSystemPrompt: conversation.org.systemPrompt,
    contextBlock,
  });
  const history = trimHistory([...priorHistory, { role: "user", content: userMessage }]);
  const startedAt = Date.now();

  const result = streamText({
    model: chatModel(),
    instructions: system,
    messages: toModelMessages(history),
    temperature: 0.6,
    // Generous budget: some Gemini 3.x models spend output tokens on reasoning
    // before the visible answer, so a small cap can yield an empty reply.
    maxOutputTokens: 4000,
    async onFinish({ text, usage }) {
      const responseMs = Date.now() - startedAt;
      try {
        await prisma.$transaction([
          prisma.message.create({
            data: {
              conversationId,
              role: MessageRole.user,
              content: userMessage,
            },
          }),
          prisma.message.create({
            data: {
              conversationId,
              role: MessageRole.assistant,
              content: text,
              responseMs,
              promptTokens: usage?.inputTokens ?? null,
              citations: citations.length ? (citations as unknown as object[]) : undefined,
            },
          }),
          prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          }),
          prisma.usageEvent.create({
            data: {
              orgId,
              type: channel === Channel.API ? "api_message" : "chat_message",
              channel,
              conversationId,
              tokens: usage?.totalTokens ?? null,
              latencyMs: responseMs,
              retrievedDocs,
            },
          }),
        ]);
      } catch (err) {
        logger.error({ err, conversationId }, "failed to persist chat turn");
      }
    },
  });

  return { result, citations };
}

/** Derive a short conversation title from the first user message. */
export async function maybeAutoTitle(conversationId: string, firstMessage: string) {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true, _count: { select: { messages: true } } },
  });
  if (!convo || convo._count.messages > 0 || convo.title !== "New conversation") return;
  const title = firstMessage.trim().replace(/\s+/g, " ").slice(0, 60);
  await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
}
