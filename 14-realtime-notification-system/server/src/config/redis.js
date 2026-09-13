const Redis = require("ioredis");

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6380", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    redis.on("error", (err) => console.error("Redis error:", err.message));
  }
  return redis;
}

module.exports = { getRedis };
