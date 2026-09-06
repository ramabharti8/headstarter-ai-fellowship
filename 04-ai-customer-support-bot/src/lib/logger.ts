import pino from "pino";

/**
 * Plain JSON logger. We deliberately avoid `pino-pretty` / transport targets:
 * they run in a worker thread that Next.js's bundler cannot resolve reliably,
 * which surfaces as "Cannot find module .../worker.js" at runtime. Pipe the
 * output through `pino-pretty` on the CLI in dev if you want colour:
 *   npm run dev | npx pino-pretty
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "development" ? "debug" : "info"),
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash"],
});

export type Logger = typeof logger;
