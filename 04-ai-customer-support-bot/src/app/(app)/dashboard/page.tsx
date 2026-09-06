import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getOrgAnalytics } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { UsageChart } from "@/components/usage-chart";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const { org } = await requireOrg();
  const a = await getOrgAnalytics(org.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <h1 className="font-serif text-2xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{org.name} · last 30 days</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Conversations" value={a.totals.conversations} />
          <Stat label="Messages" value={a.totals.messages} />
          <Stat label="KB documents" value={a.totals.documents} />
          <Stat
            label="Avg. response time"
            value={a.avgResponseMs ? `${(a.avgResponseMs / 1000).toFixed(1)}s` : "—"}
          />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Messages per day</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageChart data={a.daily} />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Most-cited documents</CardTitle>
          </CardHeader>
          <CardContent>
            {a.topDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No knowledge-base citations yet.{" "}
                <Link href="/knowledge" className="text-primary hover:underline">
                  Upload a document
                </Link>{" "}
                to get started.
              </p>
            ) : (
              <ul className="space-y-2">
                {a.topDocuments.map((d) => (
                  <li key={d.title} className="flex justify-between text-sm">
                    <span>{d.title}</span>
                    <span className="text-muted-foreground">{d.retrievals} citations</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
