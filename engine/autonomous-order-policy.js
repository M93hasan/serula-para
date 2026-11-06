// Autonomous trading policy evaluation. No exchange request or credential access.
// Live execution remains disabled until separately reviewed and explicitly configured.
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const SYMBOL = /^[A-Z0-9]{2,20}_TRY$/;

function parseAmount(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('INVALID_AMOUNT');
  const [whole, fractional = ''] = value.split('.');
  const units = BigInt(whole) * 100000000n + BigInt(fractional.padEnd(8, '0'));
  if (units <= 0n || units > 100000000000000000n) throw new Error('INVALID_AMOUNT');
  return units;
}
function parseNonnegative(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('INVALID_AMOUNT');
  const [whole, fractional = ''] = value.split('.');
  return BigInt(whole) * 100000000n + BigInt(fractional.padEnd(8, '0'));
}

/**
 * Pure fail-closed preflight for a future, explicitly enabled autonomous order engine.
 * All monetary amounts are fixed-point TRY decimal strings (up to 8 places).
 * observedDailyLossTry must include realized losses and an appropriately
 * conservative open-position estimate before any live execution is considered.
 */
export function assessAutonomousOrder({ policy, order, state, now = Date.now() }) {
  const deny = reason => ({ allowed: false, reason });
  if (!policy || !order || !state || typeof now !== 'number' || !Number.isFinite(now)) return deny('INVALID_INPUT');
  if (policy.enabled !== true || policy.liveOrdersEnabled !== true) return deny('LIVE_DISABLED');
  if (state.halted !== false) return deny('HALTED');
  if (state.connectionHealthy !== true || state.marketFresh !== true || state.balancesFresh !== true) return deny('STALE_STATE');
  if (!Number.isSafeInteger(state.updatedAt) || now - state.updatedAt < 0 || now - state.updatedAt > 15000) return deny('STALE_STATE');
  if (typeof order.symbol !== 'string' || !SYMBOL.test(order.symbol) ||
      !Array.isArray(policy.allowSymbols) || !policy.allowSymbols.includes(order.symbol)) return deny('SYMBOL_NOT_ALLOWED');
  if (!['BUY','SELL'].includes(order.side)) return deny('INVALID_SIDE');
  if (typeof order.clientOrderId !== 'string' || !/^[a-zA-Z0-9_-]{12,64}$/.test(order.clientOrderId)) return deny('INVALID_ID');
  if (!Array.isArray(state.usedOrderIds) || state.usedOrderIds.includes(order.clientOrderId)) return deny('DUPLICATE_OR_UNKNOWN_IDS');
  if (state.pendingOrder === true || !Number.isSafeInteger(state.ordersToday) || state.ordersToday < 0) return deny('ORDER_IN_PROGRESS');
  if (!Number.isSafeInteger(policy.maxOrdersPerDay) || policy.maxOrdersPerDay < 1 ||
      policy.maxOrdersPerDay > 100 || state.ordersToday >= policy.maxOrdersPerDay) return deny('DAILY_ORDER_LIMIT');
  try {
    const amount = parseAmount(order.notionalTry);
    const maxOrder = parseAmount(policy.maxOrderTry);
    const maxDailyLoss = parseAmount(policy.maxDailyLossTry);
    const dailyLoss = parseNonnegative(state.observedDailyLossTry);
    const totalExposure = parseNonnegative(state.totalExposureTry);
    const maxExposure = parseAmount(policy.maxExposureTry);
    if (amount > maxOrder) return deny('ORDER_LIMIT');
    if (dailyLoss >= maxDailyLoss) return deny('LOSS_LIMIT');
    if (totalExposure + (order.side === 'BUY' ? amount : 0n) > maxExposure) return deny('EXPOSURE_LIMIT');
  } catch {
    return deny('INVALID_AMOUNT');
  }
  if (state.exchangeFiltersVerified !== true || state.availableBalanceVerified !== true) return deny('EXCHANGE_CHECK_REQUIRED');
  return { allowed: true, reason: 'PREFLIGHT_PASSED_NOT_EXECUTED' };
}
