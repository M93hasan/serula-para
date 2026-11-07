import { createHmac } from 'node:crypto';

// Only these read-only endpoints are implemented; no generic request or order API is exposed.
export class BinanceTR {
  #fetch; #blockedUntil = 0; #clock;
  constructor({ fetchImpl = fetch, clock = Date.now } = {}) { this.#fetch = fetchImpl; this.#clock = clock; }
  async #get(path, query = '', apiKey) {
    if (this.#clock() < this.#blockedUntil) throw new Error('Binance TR rate limit cooldown');
    const response = await this.#fetch(`https://www.binance.tr${path}${query ? `?${query}` : ''}`, {
      method: 'GET', redirect: 'error', headers: apiKey ? { 'X-MBX-APIKEY': apiKey } : {}, signal: AbortSignal.timeout(10000),
    });
    if (response.status === 418 || response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      this.#blockedUntil = this.#clock() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000);
      throw new Error('Binance TR rate limit cooldown');
    }
    if (!response.ok) throw new Error(`Binance TR HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 0) throw new Error('Binance TR returned an error');
    return result;
  }
  time() { return this.#get('/open/v1/common/time'); }
  symbols() { return this.#get('/open/v1/common/symbols'); }
  // Binance TR official order listing. type=1 restricts to ACTIVE orders.
  // No POST/DELETE order or cancel methods are exposed by this adapter.
  openOrders({apiKey,secretKey,symbol,limit=100}){
    if(!apiKey||!secretKey)throw Error('Credentials required');
    if(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)
      ||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid order query');
    const query=new URLSearchParams({symbol,type:'1',limit:String(limit),
      timestamp:String(this.#clock()),recvWindow:'5000'}).toString();
    const signature=createHmac('sha256',secretKey).update(query).digest('hex');
    return this.#get('/open/v1/orders',query+'&signature='+signature,apiKey);
  }
  account({ apiKey, secretKey }) {
    if (!apiKey || !secretKey) throw new Error('Credentials required');
    const query = new URLSearchParams({ timestamp: String(this.#clock()), recvWindow: '5000' }).toString();
    const signature = createHmac('sha256', secretKey).update(query).digest('hex');
    return this.#get('/open/v1/account/spot', `${query}&signature=${signature}`, apiKey);
  }
}
