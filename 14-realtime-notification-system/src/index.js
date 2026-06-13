require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const userSockets = new Map();

const NOTIFICATION_KEY = (userId) => `notifications:${userId}`;
const DELIVERY_KEY = (notifId) => `delivery:${notifId}`;

io.on("connection", (socket) => {
  socket.on("authenticate", async ({ userId }) => {
    socket.data.userId = userId;
    userSockets.set(userId, socket.id);

    const pending = await redis.lrange(NOTIFICATION_KEY(userId), 0, -1);
    if (pending.length > 0) {
      const notifications = pending.map((n) => JSON.parse(n));
      socket.emit("pending_notifications", { notifications });
    }
  });

  socket.on("acknowledge", async ({ notificationId }) => {
    await redis.hset(DELIVERY_KEY(notificationId), "status", "acknowledged", "ackAt", Date.now());
    socket.emit("ack_confirmed", { notificationId });
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId;
    if (userId) userSockets.delete(userId);
  });
});

app.post("/api/notify", async (req, res) => {
  const { userId, title, message, type = "info", priority = "normal" } = req.body;

  const notification = {
    id: uuidv4(),
    userId,
    title,
    message,
    type,
    priority,
    createdAt: new Date().toISOString(),
    status: "sent",
  };

  await redis.hset(DELIVERY_KEY(notification.id), {
    ...notification,
    status: "sent",
    sentAt: Date.now(),
  });

  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit("notification", notification);
    await redis.hset(DELIVERY_KEY(notification.id), "status", "delivered", "deliveredAt", Date.now());
    notification.status = "delivered";
  } else {
    await redis.lpush(NOTIFICATION_KEY(userId), JSON.stringify(notification));
    await redis.expire(NOTIFICATION_KEY(userId), 86400 * 7);
  }

  res.json({ notificationId: notification.id, status: notification.status });
});

app.post("/api/broadcast", async (req, res) => {
  const { title, message, type = "info" } = req.body;
  const notification = { id: uuidv4(), title, message, type, createdAt: new Date().toISOString() };
  io.emit("broadcast", notification);
  res.json({ notificationId: notification.id, recipients: userSockets.size });
});

app.get("/api/delivery/:notificationId", async (req, res) => {
  const data = await redis.hgetall(DELIVERY_KEY(req.params.notificationId));
  if (!Object.keys(data).length) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

app.get("/health", (_req, res) => res.json({ status: "ok", connected: userSockets.size }));

const PORT = process.env.PORT || 3004;
server.listen(PORT, () => console.log(`Notification server running on port ${PORT}`));
