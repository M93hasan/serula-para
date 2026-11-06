import {createHmac} from 'node:crypto';
// Binance TR signed order endpoints ONLY. No withdraw route or generic signed-path access.
// Not constructed or exposed by the production server.
export class BinanceTROrderClient {
  #fetch;#clock;#keys;
  constructor({fetchImpl=fetch,clock=Date.now,keys}={}){
    if(typeof keys?.apiKey!=='string'||typeof keys?.secretKey!=='string'||!keys.apiKey||!keys.secretKey)throw Error('KEYS_REQUIRED');
    this.#keys=keys;this.#fetch=fetchImpl;this.#clock=clock;
  }
  async #send(method,path,params){
    const query=new URLSearchParams({...params,timestamp:String(this.#clock()),recvWindow:'5000'});
    const signature=createHmac('sha256',this.#keys.secretKey).update(query.toString()).digest('hex');
    query.set('signature',signature);
    // Do not retry POST on a timeout: the exchange may already have accepted the order.
    const res=await this.#fetch('https://www.binance.tr'+path+'?'+query,{method,redirect:'error',headers:{'X-MBX-APIKEY':this.#keys.apiKey},signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw Error('EXCHANGE_HTTP_'+res.status);
    const json=await res.json();
    if(json?.code!==0||!json?.data)throw Error('EXCHANGE_REJECTED');
    return json.data;
  }
  placeLimit(order){
    if(!['BUY','SELL'].includes(order.side)||!/^para_[A-Za-z0-9_-]{8,64}$/.test(order.clientId))throw Error('INVALID_ORDER');
    return this.#send('POST','/open/v1/orders',{symbol:order.symbol,side:String(order.side==='BUY'?0:1),type:'1',quantity:order.quantity,price:order.price,timeInForce:'1',clientId:order.clientId});
  }
  detail(clientId){
    if(!/^para_[A-Za-z0-9_-]{8,64}$/.test(clientId))throw Error('INVALID_ID');
    return this.#send('GET','/open/v1/orders/detail',{clientId});
  }
  cancel(clientId){
    if(!/^para_[A-Za-z0-9_-]{8,64}$/.test(clientId))throw Error('INVALID_ID');
    return this.#send('POST','/open/v1/orders/cancel',{clientId});
  }
}
