import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EmbeddingModel, LanguageModel } from "ai";
import { MockLanguageModelV4, MockEmbeddingModelV4, simulateReadableStream } from "ai/test";
import { env } from "@/lib/env";

/**
 * Single place that knows which LLM vendor we talk to. Call sites use
 * `chatModel()` / `embeddingModel()` and never import a vendor SDK directly,
 * so switching providers is an env change (`AI_PROVIDER`) plus one case here.
 */

let _chat: LanguageModel | null = null;
let _embed: EmbeddingModel | null = null;

function build(): { chat: LanguageModel; embed: EmbeddingModel } {
  switch (env.AI_PROVIDER) {
    case "mock": {
      // Deterministic models for local e2e / CI. No network, no API key.
      // The mock model part/usage schema is internal and version-churny, so we
      // build a minimal stream and cast to the public model type.
      const reply =
        "Thanks for reaching out — this is a mock response for testing. I'd normally check your order and help resolve the issue.";
      const usage = {
        inputTokens: { total: 10 },
        outputTokens: { total: 20 },
        totalTokens: 30,
      };
      const chunks = [
        { type: "text-start", id: "0" },
        ...reply.split(" ").map((w) => ({ type: "text-delta", id: "0", delta: w + " " })),
        { type: "text-end", id: "0" },
        { type: "finish", finishReason: "stop", usage },
      ] as unknown[];
      const chat = new MockLanguageModelV4({
        doStream: async () =>
          ({
            stream: simulateReadableStream({ chunks }),
          }) as unknown as Awaited<ReturnType<MockLanguageModelV4["doStream"]>>,
      }) as unknown as LanguageModel;
      const embed = new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => ({
          embeddings: values.map(() => Array.from({ length: env.AI_EMBEDDING_DIM }, () => 0.01)),
          warnings: [],
        }),
      }) as unknown as EmbeddingModel;
      return { chat, embed };
    }
    case "google": {
      if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set (AI_PROVIDER=google)");
      }
      const google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
      return {
        chat: google(env.AI_CHAT_MODEL),
        // Only used by the mock path; the google path embeds via REST (see embeddings.ts)
        // to control output dimensionality across SDK versions.
        embed: google.textEmbeddingModel(env.AI_EMBEDDING_MODEL),
      };
    }
    // openai / anthropic / groq: install the matching @ai-sdk/* package and wire it here.
    default:
      throw new Error(
        `AI_PROVIDER="${env.AI_PROVIDER}" is not wired up in this build. Use "google".`,
      );
  }
}

export function chatModel(): LanguageModel {
  if (!_chat) _chat = build().chat;
  return _chat;
}

export function embeddingModel(): EmbeddingModel {
  if (!_embed) _embed = build().embed;
  return _embed;
}

export const EMBEDDING_DIM = env.AI_EMBEDDING_DIM;
