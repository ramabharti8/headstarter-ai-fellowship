import { NextRequest } from "next/server";
import { bearerFrom, resolveApiKey, type ResolvedKey } from "@/lib/api-key";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Errors } from "@/lib/errors";
import { env } from "@/lib/env";

/** Authenticate a public-API request by bearer key and apply per-key rate limiting. */
export async function authenticateV1(req: NextRequest): Promise<ResolvedKey> {
  const raw = bearerFrom(req.headers.get("authorization"));
  const resolved = await resolveApiKey(raw);
  if (!resolved) throw Errors.unauthorized("Invalid or missing API key");
  await enforceRateLimit(`v1:${resolved.apiKeyId}`, env.RATE_LIMIT_API_PER_MINUTE);
  return resolved;
}
