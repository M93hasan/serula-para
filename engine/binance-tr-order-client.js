import {createHmac} from 'node:crypto';
import {exchangeOrderId} from './order-rules.js';
// Binance TR signed order endpoints ONLY. No withdraw route or generic signed-path access.
// Not constructed or exposed by the production server.
export class BinanceTROrderClient {
  #fetch;#clock;#keys;#writeApproval;
  constructor({fetchImpl=fetch,clock=Date.now,keys,writeApproval=()=>false}={}){
    if(typeof keys?.apiKey!=='string'||typeof keys?.secretKey!=='string'||!keys.apiKey||!keys.secretKey)throw Error('KEYS_REQUIRED');
    if(typeof writeApproval!=='function')throw Error('INVALID_APPROVAL');
    this.#keys=keys;this.#fetch=fetchImpl;this.#clock=clock;this.#writeApproval=writeApproval;
  }
  async #send(method,path,params){
    if(method==='POST'&&this.#writeApproval({method,path,params})!==true)throw Error('LIVE_ORDERS_DISABLED');
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
  async openOrders(symbol){
    if(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol))throw Error('INVALID_SYMBOL');
    const limit=1000;
    const data=await this.#send('GET','/open/v1/orders',{symbol,type:'1',limit:String(limit)});
    // A full page is not evidence that every open order was returned.
    if(!Array.isArray(data?.list)||data.list.length>=limit)throw Error('OPEN_ORDERS_INCOMPLETE');
    const seen=new Set();
    return data.list.map(order=>{
      const orderId=exchangeOrderId(order?.orderId);
      if(order.symbol!==symbol||![-2,0,1,4].includes(order.status)||seen.has(orderId))
        throw Error('INVALID_OPEN_ORDER');
      seen.add(orderId);
      return {symbol,orderId,status:order.status};
    });
  }
  async trades(symbol,{startTime,endTime,fromId,direct,limit=500}={}){
    if(typeof symbol!=='string'||!/^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/.test(symbol)||
       !Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('INVALID_TRADE_QUERY');
    const params={symbol,limit:String(limit)};
    for(const [name,value] of Object.entries({startTime,endTime,fromId})){
      if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw Error('INVALID_TRADE_QUERY');
      if(value!==undefined)params[name]=String(value);
    }
    if(direct!==undefined){if(!['next','prev'].includes(direct))throw Error('INVALID_TRADE_QUERY');params.direct=direct;}
    const data=await this.#send('GET','/open/v1/orders/trades',params);
    if(!Array.isArray(data?.list)||data.list.length>=limit)throw Error('TRADE_HISTORY_INCOMPLETE');
    const seen=new Set();
    return data.list.map(fill=>{
      const tradeId=String(fill?.tradeId),orderId=exchangeOrderId(fill?.orderId);
      if(!/^[1-9]\d{0,18}$/.test(tradeId)||seen.has(tradeId)||fill.symbol!==symbol||
         !['string','number'].includes(typeof fill.price)||!['string','number'].includes(typeof fill.qty)||
         !['string','number'].includes(typeof fill.quoteQty)||!['string','number'].includes(typeof fill.commission)||
         typeof fill.commissionAsset!=='string'||typeof fill.isBuyer!=='boolean'||!Number.isSafeInteger(Number(fill.time)))
        throw Error('INVALID_TRADE_HISTORY');
      seen.add(tradeId);
      return {tradeId,orderId,symbol,price:String(fill.price),qty:String(fill.qty),quoteQty:String(fill.quoteQty),
        commission:String(fill.commission),commissionAsset:fill.commissionAsset,isBuyer:fill.isBuyer,time:Number(fill.time)};
    });
  }
  placeLimit(order){
    if(!['BUY','SELL'].includes(order.side)||!/^para_[A-Za-z0-9_-]{8,64}$/.test(order.clientId))throw Error('INVALID_ORDER');
    return this.#send('POST','/open/v1/orders',{symbol:order.symbol,side:String(order.side==='BUY'?0:1),type:'1',quantity:order.quantity,price:order.price,timeInForce:'1',clientId:order.clientId});
  }
  detail(clientId,orderId=null){
    if(!/^para_[A-Za-z0-9_-]{8,64}$/.test(clientId))throw Error('INVALID_ID');
    return this.#send('GET','/open/v1/orders/detail',orderId===null?{clientId}:{orderId:exchangeOrderId(orderId)});
  }
  cancel(clientId,orderId){
    if(!/^para_[A-Za-z0-9_-]{8,64}$/.test(clientId))throw Error('INVALID_ID');
    if(orderId==null)throw Error('ORDER_ID_REQUIRED');
    return this.cancelByOrderId(orderId);
  }
  cancelByOrderId(orderId){return this.#send('POST','/open/v1/orders/cancel',{orderId:exchangeOrderId(orderId)});}
}
