import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = { app: "ok" };
  let status = 200;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "error";
    status = 503;
  }
  return NextResponse.json(
    { status: status === 200 ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
