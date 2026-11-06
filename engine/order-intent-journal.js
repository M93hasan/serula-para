import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const HEX = /^[0-9a-f]{32}$/;
const asSha = order => createHash('sha256').update(JSON.stringify(order)).digest('hex');

// Persisted preparation ONLY. No Binance credentials, HTTP clients, or order-submission method.
// Reservations are permanent so a crash, timeout, or restart can never cause implicit retries.
export class OrderIntentJournal {
  #db;
  constructor(file) {
    if (typeof file !== 'string' || !file) throw Error('JOURNAL_PATH_REQUIRED');
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(file);
    this.#db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS order_intents (
        intent_id TEXT PRIMARY KEY NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        client_order_id TEXT UNIQUE NOT NULL,
        order_sha256 TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        price TEXT NOT NULL,
        quantity TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('RESERVED','UNKNOWN','RECONCILED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        exchange_order_id TEXT
      );`);
  }
  reserve({ idempotencyKey, order } = {}) {
    if (!HEX.test(idempotencyKey ?? '') || !order || typeof order !== 'object' || Array.isArray(order) ||
      Object.keys(order).sort().join(',') !== 'price,quantity,side,symbol' ||
      typeof order.symbol !== 'string' || !/^[A-Z0-9]{1,20}_TRY$/.test(order.symbol) ||
      !['BUY', 'SELL'].includes(order.side) ||
      !['price','quantity'].every(field => typeof order[field] === 'string' && /^(?:0|[1-9]\d{0,14})(?:\.\d{1,8})?$/.test(order[field]) && Number(order[field]) > 0))
      throw Error('INVALID_INTENT');
    const existing = this.#db.prepare('SELECT order_sha256 FROM order_intents WHERE idempotency_key=?').get(idempotencyKey);
    if (existing) throw Error(existing.order_sha256 === asSha(order) ? 'DUPLICATE_INTENT' : 'IDEMPOTENCY_CONFLICT');
    const intentId = randomBytes(16).toString('hex');
    const clientOrderId = `para_${randomBytes(16).toString('hex')}`;
    const timestamp = new Date().toISOString();
    try {
      this.#db.prepare(`INSERT INTO order_intents
        (intent_id,idempotency_key,client_order_id,order_sha256,symbol,side,price,quantity,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(intentId, idempotencyKey, clientOrderId,
          asSha(order), order.symbol, order.side, order.price, order.quantity, 'RESERVED', timestamp, timestamp);
    } catch(e) {
      if (String(e.code).includes('SQLITE_CONSTRAINT')) throw Error('INTENT_ALREADY_EXISTS');
      throw e;
    }
    return Object.freeze({ intentId, clientOrderId, status: 'RESERVED', executionEnabled: false });
  }
  markUnknown(intentId) {
    if (!HEX.test(intentId ?? '')) throw Error('INVALID_INTENT_ID');
    const result = this.#db.prepare(`UPDATE order_intents SET status='UNKNOWN',updated_at=? WHERE intent_id=? AND status='RESERVED'`)
      .run(new Date().toISOString(), intentId);
    if (result.changes !== 1) throw Error('INTENT_NOT_RESERVABLE');
    return Object.freeze({ intentId, status: 'UNKNOWN', retryAllowed: false, executionEnabled: false });
  }
  // Evidence is stored for audit; it can NEVER release an idempotency key or enable retries.
  recordReconciliation({ intentId, exchangeOrderId } = {}) {
    if (!HEX.test(intentId ?? '') || typeof exchangeOrderId !== 'string' || !/^[0-9]{1,30}$/.test(exchangeOrderId))
      throw Error('INVALID_RECONCILIATION');
    const result = this.#db.prepare(`UPDATE order_intents SET status='RECONCILED',exchange_order_id=?,updated_at=? WHERE intent_id=? AND status='UNKNOWN'`)
      .run(exchangeOrderId, new Date().toISOString(), intentId);
    if (result.changes !== 1) throw Error('RECONCILIATION_UNAVAILABLE');
    return Object.freeze({ intentId, status: 'RECONCILED', retryAllowed: false });
  }
  status(intentId) {
    if (!HEX.test(intentId ?? '')) throw Error('INVALID_INTENT_ID');
    const row = this.#db.prepare(`SELECT intent_id,client_order_id,symbol,side,price,quantity,status,created_at,updated_at,exchange_order_id FROM order_intents WHERE intent_id=?`).get(intentId);
    return row ? Object.freeze({ ...row, retryAllowed: false, executionEnabled: false }) : null;
  }
  close() { this.#db.close(); }
}
