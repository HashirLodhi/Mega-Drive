import "server-only";
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function redisConfigured() {
  return Boolean(
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
  );
}

export function redis() {
  if (!redisConfigured()) {
    throw new Error("Durable storage is not configured. Connect Upstash Redis to this Vercel project, then redeploy.");
  }
  client ??= Redis.fromEnv();
  return client;
}
