import { Composer } from "grammy";
import type { BotContext } from "../types/index.js";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests per window */
  maxRequests: number;
  /** Message to show when rate-limited */
  message?: string;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60_000, // 1 minute
  maxRequests: 20,
  message: "⏳ You're sending requests too fast. Please wait a moment.",
};

interface UserBucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter per user.
 * Prevents command spam and API abuse.
 */
export function rateLimit(
  options: Partial<RateLimitOptions> = {}
): Composer<BotContext> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const buckets = new Map<number, UserBucket>();
  const composer = new Composer<BotContext>();

  // Cleanup old buckets every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) {
        buckets.delete(key);
      }
    }
  }, 5 * 60_000);

  composer.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await next();
      return;
    }

    const now = Date.now();
    let bucket = buckets.get(userId);

    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(userId, bucket);
    }

    bucket.count++;

    if (bucket.count > opts.maxRequests) {
      await ctx.reply(opts.message!);
      return;
    }

    await next();
  });

  return composer;
}
