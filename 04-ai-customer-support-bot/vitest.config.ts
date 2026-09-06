import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
      AUTH_SECRET: "test-secret-value-at-least-something",
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
      AI_EMBEDDING_DIM: "768",
    },
  },
});
