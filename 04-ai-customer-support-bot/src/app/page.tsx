import Link from "next/link";
import { getCurrentUser } from "@/lib/tenant";

const features = [
  {
    title: "General-purpose streaming chat",
    body: "Answers code, writing, and analysis like a modern assistant. Per-conversation memory, token-budget trimming, and a configurable system prompt per workspace.",
  },
  {
    title: "RAG knowledge base",
    body: "Upload help docs (txt/md/pdf). They're chunked, embedded, and stored in pgvector; answers cite the source excerpt.",
  },
  {
    title: "Multi-tenant by design",
    body: "Organizations, roles (owner/admin/member), and per-org API keys. Every query is scoped to the caller's tenant.",
  },
  {
    title: "REST API + embeddable widget",
    body: "Bearer-authed /api/v1 endpoints (streaming or JSON) with per-key rate limits, plus a one-line <script> chat widget.",
  },
  {
    title: "Production hardening",
    body: "Zod validation everywhere, hashed API keys, structured logging, health checks, rate limiting, and a consistent error envelope.",
  },
  {
    title: "CI/CD",
    body: "Dockerized, GitHub Actions running typecheck / lint / unit + e2e tests, migrations on deploy.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <header className="flex items-center justify-between">
        <span className="font-serif text-xl">
          Helpdesk<span className="text-primary">AI</span>
        </span>
        <nav className="flex gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium hover:bg-accent"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-2xl font-serif text-4xl tracking-tight sm:text-5xl">
          An AI assistant platform your whole team can run
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Streaming chat that answers anything, grounded in your own knowledge base — with the auth,
          API, and deployment story of a real product.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href={user ? "/dashboard" : "/sign-up"}
            className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {user ? "Open dashboard" : "Start free"}
          </Link>
          <a
            href="https://github.com/ramabharti8/headstarter-ai-fellowship"
            className="inline-flex h-10 items-center rounded-md border border-input px-6 text-sm font-medium hover:bg-accent"
          >
            View source
          </a>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-serif text-lg">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-20 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        Built with Next.js, Prisma, pgvector, and the Vercel AI SDK.
      </footer>
    </main>
  );
}
