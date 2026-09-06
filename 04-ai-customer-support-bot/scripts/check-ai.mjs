// Quick smoke test for the Google AI key + configured models.
//   node scripts/check-ai.mjs
import "dotenv/config";

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set in .env");
  process.exit(1);
}
const chatModel = process.env.AI_CHAT_MODEL || "gemini-flash-lite-latest";
const embedModel = process.env.AI_EMBEDDING_MODEL || "gemini-embedding-001";
const dim = Number(process.env.AI_EMBEDDING_DIM || 768);
const base = "https://generativelanguage.googleapis.com/v1beta";

console.log(`key ${key.slice(0, 6)}… · chat=${chatModel} · embed=${embedModel} (${dim}d)`);

const chat = await fetch(`${base}/models/${chatModel}:generateContent?key=${key}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "Say hello in 3 words." }] }] }),
}).then((r) => r.json());
console.log(
  "[chat]",
  chat.error
    ? `ERROR ${chat.error.message}`
    : `OK — ${chat.candidates?.[0]?.content?.parts?.[0]?.text?.trim()}`,
);

const emb = await fetch(`${base}/models/${embedModel}:embedContent?key=${key}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: { parts: [{ text: "refund policy" }] }, outputDimensionality: dim }),
}).then((r) => r.json());
console.log(
  "[embed]",
  emb.error ? `ERROR ${emb.error.message}` : `OK — ${emb.embedding?.values?.length}-dim vector`,
);
