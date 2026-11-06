// Deterministic exponential retry: 5s, 10s, 20s, 40s, then at most 60s.
export function reconnectDelay(attempt) {
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new RangeError('attempt must be positive');
  return Math.min(60000, 5000 * 2 ** Math.min(attempt - 1, 4));
}
