/**
 * Small fixed-window rate limiter kept in process memory.
 *
 * It limits load and slows down password guessing, but it is NOT access control:
 * each serverless instance has its own counters. Access control is the session check.
 */
interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Returns how many seconds to wait, or 0 when the request is allowed. */
  hit(key: string, now: number = Date.now()): number {
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      if (this.windows.size >= this.maxKeys) this.sweep(now);
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count += 1;
    if (w.count > this.limit) return Math.max(1, Math.ceil((w.resetAt - now) / 1000));
    return 0;
  }

  reset() {
    this.windows.clear();
  }

  private sweep(now: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}

/** Sign-in attempts per client IP (an office NAT shares one IP, so not too strict). */
export const loginLimiter = new RateLimiter(Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE) || 20, 60_000);
/** Writes per member. Generous: a drag-heavy session is ~1 write per second at most. */
export const writeLimiter = new RateLimiter(120, 60_000);
