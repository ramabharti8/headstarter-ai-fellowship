import { NextRequest } from "next/server";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrg } from "@/lib/tenant";
import { readJson, json, noStore } from "@/lib/http";
import { toErrorResponse } from "@/lib/errors";
import { createConversationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { org } = await requireOrg();
    const conversations = await prisma.conversation.findMany({
      where: { orgId: org.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        channel: true,
        useKnowledge: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    return json({ conversations }, noStore);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, org } = await requireOrg();
    const body = await readJson(req, createConversationSchema);
    const conversation = await prisma.conversation.create({
      data: {
        orgId: org.id,
        title: body.title ?? "New conversation",
        channel: Channel.WEB,
        useKnowledge: body.useKnowledge ?? true,
        createdByUser: user.id,
      },
      select: { id: true, title: true, useKnowledge: true, channel: true, updatedAt: true },
    });
    return json({ conversation }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
