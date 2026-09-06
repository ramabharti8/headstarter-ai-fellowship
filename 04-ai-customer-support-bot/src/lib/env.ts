import { z } from "zod";

/**
 * Validated environment. Import `env` anywhere instead of touching `process.env`
 * directly so misconfiguration fails fast at boot rather than at request time.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),

  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_URL: z.string().url().optional(),
  AUTH_GOOGLE_ID: z.string().optional().default(""),
  AUTH_GOOGLE_SECRET: z.string().optional().default(""),

  AI_PROVIDER: z.enum(["google", "openai", "anthropic", "groq", "mock"]).default("google"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  AI_CHAT_MODEL: z.string().default("gemini-flash-lite-latest"),
  AI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  AI_EMBEDDING_DIM: z.coerce.number().int().positive().default(768),

  SENTRY_DSN: z.string().optional().default(""),

  RATE_LIMIT_CHAT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5_242_880),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

export const googleConfigured = env.AUTH_GOOGLE_ID !== "" && env.AUTH_GOOGLE_SECRET !== "";
