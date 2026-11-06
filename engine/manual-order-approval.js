import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// Independent, fail-closed approval state. No exchange client and no network calls.
// An approval is NOT an order: only a separately audited execution service may consume it.
const DECIMAL = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;
const validMoney = (value) => typeof value === 'string' && DECIMAL.test(value) && Number.isFinite(Number(value)) && Number(value) > 0;
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class ManualOrderApproval {
  #pending = new Map();
  #clock; #maxTry; #ttl;
  constructor({ maxOrderTry, ttlMs = 60000, clock = Date.now } = {}) {
    if (!Number.isSafeInteger(maxOrderTry) || maxOrderTry < 1 || maxOrderTry > 1000000) throw Error('MAX_ORDER_REQUIRED');
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 120000) throw Error('INVALID_TTL');
    this.#maxTry = maxOrderTry; this.#ttl = ttlMs; this.#clock = clock;
  }
  propose(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'price,quantity,side,symbol') throw Error('INVALID_ORDER');
    const { symbol, side, quantity, price } = input;
    if (!/^[A-Z0-9]{1,20}_TRY$/.test(symbol) || !['BUY','SELL'].includes(side) ||
        !validMoney(price) || !validMoney(quantity)) throw Error('INVALID_ORDER');
    const notional = Number(price) * Number(quantity);
    if (!Number.isFinite(notional) || notional <= 0 || notional > this.#maxTry ||
        Math.round(notional * 100) / 100 > this.#maxTry) throw Error('ORDER_LIMIT');
    const now = this.#clock();
    if (!Number.isSafeInteger(now)) throw Error('INVALID_CLOCK');
    // New proposals invalidate prior unconsumed approvals to avoid ambiguous clicks.
    this.#pending.clear();
    const id = randomBytes(16).toString('hex');
    const order = Object.freeze({symbol, side, quantity, price});
    const digest = fingerprint(order);
    this.#pending.set(id, {order, digest, expiresAt:now+this.#ttl, state:'pending'});
    return Object.freeze({id, ...order, estimatedNotionalTry: Math.ceil(notional * 100) / 100,
      expiresAt:now+this.#ttl, digest, warning:'Bu yalnızca onay önizlemesidir; borsaya emir gönderilmez.'});
  }
  approve({id, digest, confirmation} = {}) {
    if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw Error('INVALID_APPROVAL');
    const entry = this.#pending.get(id);
    // First attempt consumes the proposal even if text or fingerprint was wrong.
    if (!entry || entry.state !== 'pending') throw Error('APPROVAL_UNAVAILABLE');
    entry.state='consumed';
    this.#pending.delete(id);
    if (this.#clock() >= entry.expiresAt || !same(digest, entry.digest) ||
        !same(confirmation, 'ONAYLA '+id)) throw Error('APPROVAL_REJECTED');
    return Object.freeze({...entry.order, approvalId:id, approvedAt:this.#clock(), digest:entry.digest,
      executionEnabled:false, status:'APPROVED_NOT_SENT'});
  }
  cancel() { this.#pending.clear(); }
  get pendingCount() { return this.#pending.size; }
}
