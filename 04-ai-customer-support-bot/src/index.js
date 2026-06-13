require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map();

const SYSTEM_PROMPT = `You are a helpful and friendly customer support agent.
You assist customers with product questions, order issues, and general inquiries.
Be concise, empathetic, and solution-focused. If you cannot resolve an issue,
escalate to a human agent.`;

app.post("/api/chat/session", (req, res) => {
  const sessionId = uuidv4();
  sessions.set(sessionId, [{ role: "system", content: SYSTEM_PROMPT }]);
  res.json({ sessionId });
});

app.post("/api/chat/message", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: "Session not found" });
  }

  const history = sessions.get(sessionId);
  history.push({ role: "user", content: message });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: history,
    max_tokens: 512,
    temperature: 0.7,
  });

  const reply = completion.choices[0].message.content;
  history.push({ role: "assistant", content: reply });

  if (history.length > 21) {
    history.splice(1, 2);
  }

  res.json({ reply, sessionId });
});

app.delete("/api/chat/session/:id", (req, res) => {
  sessions.delete(req.params.id);
  res.json({ message: "Session ended" });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Support bot running on port ${PORT}`));
