import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8, "At least 8 characters").max(200),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1),
  messages: z
    .array(
      z
        .object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(8000),
          // AI SDK sends extra fields; allow and ignore them.
        })
        .passthrough(),
    )
    .min(1),
});

export const createConversationSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  useKnowledge: z.boolean().optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  useKnowledge: z.boolean().optional(),
});

export const orgSettingsSchema = z.object({
  name: z.string().min(1).max(80),
  systemPrompt: z.string().min(10).max(4000),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const apiKeySchema = z.object({
  name: z.string().min(1).max(60),
});

// ---- Public API (/api/v1) ----

export const v1SessionSchema = z.object({
  endUserRef: z.string().max(200).optional(),
  useKnowledge: z.boolean().optional(),
});

export const v1MessageSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(8000),
  stream: z.boolean().optional(),
});
