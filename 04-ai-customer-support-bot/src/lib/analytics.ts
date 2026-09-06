import { prisma } from "@/lib/db";

export interface OrgAnalytics {
  totals: { conversations: number; messages: number; documents: number; apiMessages: number };
  avgResponseMs: number | null;
  daily: Array<{ date: string; messages: number }>;
  topDocuments: Array<{ title: string; retrievals: number }>;
}

export async function getOrgAnalytics(orgId: string): Promise<OrgAnalytics> {
  const since = new Date(Date.now() - 29 * 24 * 3600 * 1000);
  since.setHours(0, 0, 0, 0);

  const [conversations, messages, documents, apiMessages, avg, daily] = await Promise.all([
    prisma.conversation.count({ where: { orgId } }),
    prisma.message.count({ where: { conversation: { orgId } } }),
    prisma.document.count({ where: { orgId } }),
    prisma.usageEvent.count({ where: { orgId, type: "api_message" } }),
    prisma.usageEvent.aggregate({
      where: { orgId, latencyMs: { not: null } },
      _avg: { latencyMs: true },
    }),
    prisma.$queryRaw<Array<{ date: string; messages: bigint }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS date,
             count(*) AS messages
      FROM "UsageEvent"
      WHERE "orgId" = ${orgId}
        AND "type" IN ('chat_message', 'api_message')
        AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  // Fill gaps so the chart has a continuous 30-day axis.
  const byDate = new Map(daily.map((d) => [d.date, Number(d.messages)]));
  const series: Array<{ date: string; messages: number }> = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key.slice(5), messages: byDate.get(key) ?? 0 });
  }

  const topDocuments = await prisma.$queryRaw<Array<{ title: string; retrievals: bigint }>>`
    SELECT d.title AS title, count(*) AS retrievals
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    CROSS JOIN LATERAL jsonb_array_elements(m.citations) AS cite
    JOIN "Document" d ON d.id = (cite->>'documentId')
    WHERE c."orgId" = ${orgId} AND m.citations IS NOT NULL
    GROUP BY d.title
    ORDER BY retrievals DESC
    LIMIT 5
  `;

  return {
    totals: { conversations, messages, documents, apiMessages },
    avgResponseMs: avg._avg.latencyMs ? Math.round(avg._avg.latencyMs) : null,
    daily: series,
    topDocuments: topDocuments.map((t) => ({ title: t.title, retrievals: Number(t.retrievals) })),
  };
}
