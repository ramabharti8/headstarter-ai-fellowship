require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");
const recordingRoutes = require("./routes/recordings");
const registerSocketHandlers = require("./sockets");

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/recordings", recordingRoutes);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: clientOrigin, methods: ["GET", "POST"] } });
registerSocketHandlers(io);

const PORT = process.env.PORT || 3002;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connection failed, continuing without persistence:", err.message);
  }
  server.listen(PORT, () => console.log(`Video conferencing server running on port ${PORT}`));
}

start();
