// Monetary inputs are integer minor units. Simulations never connect to an exchange.
const integer = n => Number.isSafeInteger(n) && n >= 0;
export class Simulator {
  #halted = true; #cash; #start; #maxTrade; #maxLoss; #journal = [];
  constructor({ budget, maxTrade, maxLoss }) {
    if (![budget, maxTrade, maxLoss].every(integer) || !budget || !maxTrade || !maxLoss || maxTrade > budget || maxLoss > budget) throw new Error('Invalid limits');
    this.#cash = this.#start = budget; this.#maxTrade = maxTrade; this.#maxLoss = maxLoss;
  }
  halt() { this.#halted = true; this.#journal.push({ event: 'halt' }); }
  start() { if (this.#start - this.#cash >= this.#maxLoss) throw new Error('Loss limit reached'); this.#halted = false; }
  // A conservative synthetic loss is debited immediately; no profit or balances are invented.
  evaluate({ amount, worstCaseLoss }) {
    if (this.#halted) throw new Error('Emergency stop active');
    if (![amount, worstCaseLoss].every(integer) || !amount || worstCaseLoss > amount) throw new Error('Invalid simulation');
    if (amount > this.#maxTrade || amount > this.#cash || this.#start - this.#cash + worstCaseLoss >= this.#maxLoss) throw new Error('Risk limit');
    this.#cash -= worstCaseLoss;
    const result = { event: 'simulated', amount, worstCaseLoss, remaining: this.#cash };
    this.#journal.push(result); return result;
  }
  status() { return { mode: 'simulation', realOrdersEnabled: false, halted: this.#halted, budgetRemaining: this.#cash, journal: structuredClone(this.#journal) }; }
}
// Agent interfaces accept supplied snapshots only; no claim of profitable strategy.
export const agents = {
  select: snapshots => snapshots.filter(x => x && typeof x.symbol === 'string' && Number.isFinite(x.volume) && x.volume > 0).sort((a,b) => b.volume-a.volume),
  analyze: snapshot => ({ symbol: snapshot.symbol, signal: 'hold', reason: 'strategy not validated' }),
  decide: analysis => ({ symbol: analysis.symbol, action: 'hold' }),
};
