import Redis from "ioredis";

import { env } from "../config/env.js";
import { logInfo } from "./logger.js";

declare global {
  // eslint-disable-next-line no-var
  var __studySphereRedis__: Redis | undefined;
}

function buildRedisOptions() {
  const usingTls = env.REDIS_URL.startsWith("rediss://");

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    tls: usingTls ? {} : undefined
  };
}

export const redis =
  globalThis.__studySphereRedis__ ??
  new Redis(env.REDIS_URL, buildRedisOptions());

if (process.env.NODE_ENV !== "production") {
  globalThis.__studySphereRedis__ = redis;
}

export function createRedisConnection() {
  return new Redis(env.REDIS_URL, buildRedisOptions());
}

export async function inspectRedisSafety() {
  try {
    const maxMemoryPolicy = await redis.config("GET", "maxmemory-policy");
    const policy = Array.isArray(maxMemoryPolicy) ? maxMemoryPolicy.at(-1) : undefined;

    if (policy && policy !== "noeviction") {
      logInfo("Redis eviction policy warning", {
        policy,
        expected: "noeviction"
      });
    }

    return {
      policy: typeof policy === "string" ? policy : "unknown",
      tls: env.REDIS_URL.startsWith("rediss://")
    };
  } catch {
    return {
      policy: "unknown",
      tls: env.REDIS_URL.startsWith("rediss://")
    };
  }
}
