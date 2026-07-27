type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

export function consumeLoginAttempt(key: string, now = Date.now()) {
  const windowMs = 15 * 60 * 1_000;
  const limit = 5;
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}

