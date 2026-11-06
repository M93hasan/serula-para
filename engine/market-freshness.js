// Fail closed when the observed market trade is missing, future-dated, or stale.
// This is separate from the age of the last closed 1-hour candle.
export const MAX_PRICE_AGE_MS=30_000;
export function isFreshMarketPrice(market,now=Date.now()){
  return Number.isSafeInteger(now) &&
    Number.isFinite(market?.price) && market.price>0 &&
    Number.isSafeInteger(market?.priceTime) &&
    market.priceTime<=now &&
    now-market.priceTime<=MAX_PRICE_AGE_MS;
}
