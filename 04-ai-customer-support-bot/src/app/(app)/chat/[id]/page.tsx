import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { ChatView, type Citation } from "@/components/chat-view";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { org } = await requireOrg();
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: org.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) notFound();

  const initialMessages = conversation.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      citations: (m.citations as Citation[] | null) ?? null,
    }));

  return (
    <ChatView
      conversationId={conversation.id}
      title={conversation.title}
      initialMessages={initialMessages}
      useKnowledge={conversation.useKnowledge}
    />
  );
}
