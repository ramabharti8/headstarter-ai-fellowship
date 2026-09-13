const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getRedis } = require("../config/redis");
const { sendNotificationEmail } = require("./mailer");
const presence = require("../sockets/presence");

async function resolveRecipients({ targetType, targetUserId, topic }) {
  if (targetType === "user") {
    const user = await User.findById(targetUserId);
    return user ? [user] : [];
  }
  if (targetType === "topic") {
    return User.find({ topics: topic });
  }
  return User.find({}); // broadcast
}

/**
 * Fans a single logical notification out to every resolved recipient: persists
 * one Notification document per recipient (so it survives disconnects/offline
 * users and appears in their notification center later), pushes it live over
 * Socket.IO to whoever is currently connected, sends email for recipients who
 * opted in and requested the "email" channel, and records aggregate delivery
 * status in Redis for the /api/notifications/delivery/:id lookup.
 */
async function dispatchNotification(io, { senderId, targetType, targetUserId, topic, title, message, type, priority, channels }) {
  const recipients = await resolveRecipients({ targetType, targetUserId, topic });
  const notificationId = uuidv4();
  const now = new Date();

  const docs = recipients.map((recipient) => ({
    notificationId,
    recipientId: recipient._id,
    senderId: senderId || undefined,
    title,
    message,
    type,
    priority,
    targetType,
    topic: targetType === "topic" ? topic : null,
    channels,
    delivered: presence.isOnline(recipient._id.toString()),
    createdAt: now,
    updatedAt: now,
  }));

  const inserted = docs.length ? await Notification.insertMany(docs) : [];

  // Push live to whoever is connected right now. Field shape matches the REST
  // /notifications/mine response (_id, not id) so the client can treat both
  // the initial fetch and live-pushed items identically.
  const payloadFor = (doc) => ({
    _id: doc._id,
    notificationId,
    title,
    message,
    type,
    priority,
    topic: doc.topic,
    createdAt: doc.createdAt,
    read: false,
  });

  // Emit to each recipient's own room individually (rather than the topic/broadcast
  // room as one shot) so every client gets its own Notification document's _id to
  // acknowledge/mark-read against.
  for (const doc of inserted) {
    io.to(`user:${doc.recipientId}`).emit("notification", payloadFor(doc));
  }

  // Email channel (best-effort; failures are logged, never block the response).
  if (channels.includes("email")) {
    for (const recipient of recipients) {
      if (!recipient.emailNotifications) continue;
      sendNotificationEmail({ to: recipient.email, title, message }).catch((err) =>
        console.error(`Email delivery failed for ${recipient.email}:`, err.message)
      );
    }
  }

  const deliveredCount = docs.filter((d) => d.delivered).length;
  try {
    const redis = getRedis();
    await redis.hset(`delivery:${notificationId}`, {
      title,
      recipientCount: recipients.length,
      deliveredCount,
      status: deliveredCount > 0 ? "delivered" : "sent",
      sentAt: now.getTime(),
    });
    await redis.expire(`delivery:${notificationId}`, 86400 * 7);
  } catch (err) {
    console.error("Redis delivery-tracking write failed:", err.message);
  }

  return { notificationId, recipientCount: recipients.length, deliveredCount };
}

module.exports = { dispatchNotification, resolveRecipients };
