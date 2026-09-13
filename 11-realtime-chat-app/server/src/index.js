require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const roomRoutes = require("./routes/rooms");
const messageRoutes = require("./routes/messages");
const uploadRoutes = require("./routes/upload");
const registerSocketHandlers = require("./sockets");

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: clientOrigin }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 200 });
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// Catches anything an async route handler rejected with (via asyncHandler) plus
// any synchronous throw, so a single bad request can never take the whole
// process down. Must be registered after all routes.
app.use((err, _req, res, _next) => {
  console.error("Unhandled request error:", err);
  if (err.name === "CastError") return res.status(400).json({ error: "Invalid id" });
  if (err.name === "MulterError") return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: clientOrigin, methods: ["GET", "POST"] } });
registerSocketHandlers(io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connection failed, continuing without persistence:", err.message);
  }
  server.listen(PORT, () => console.log(`Chat server running on port ${PORT}`));
}

start();
