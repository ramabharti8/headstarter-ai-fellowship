import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { Errors } from "@/lib/errors";

export async function readJson<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
