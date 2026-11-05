// Isolated in-memory paper ledger. Units are integer minor quote units and 1e-8 base units.
// This module has no exchange connection, order API, or access to real balances.
const SCALE=100000000n, BPS=10000n;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const money=(quantity,price,roundUp)=>Number((BigInt(quantity)*BigInt(price)+(roundUp?SCALE-1n:0n))/SCALE);
const cost=(value,bps)=>Number((BigInt(value)*BigInt(bps)+BPS-1n)/BPS);
export class PaperPortfolio {
  #quotes=new Map();#positions=new Map();#ids=new Map();#halted=true;
  constructor(config){
    if(!config||!Array.isArray(config.quotes)||!config.quotes.length||!Number.isInteger(config.feeBps)||config.feeBps<0||config.feeBps>500||!Number.isInteger(config.slippageBps)||config.slippageBps<0||config.slippageBps>500)throw Error('INVALID_CONFIG');
    for(const q of config.quotes){if(!/^[A-Z0-9]{1,20}$/.test(q.asset)||this.#quotes.has(q.asset)||![q.budget,q.maxTrade,q.maxExposure,q.maxAsset,q.maxLoss].every(positive)||q.maxTrade>q.budget||q.maxExposure>q.budget||q.maxAsset>q.maxExposure||q.maxLoss>q.budget)throw Error('INVALID_CONFIG');this.#quotes.set(q.asset,{...q,cash:q.budget,realized:0,fees:0});}
    this.feeBps=config.feeBps;this.slippageBps=config.slippageBps;
  }
  halt(){this.#halted=true;}
  start(){if([...this.#quotes.values()].some(q=>q.realized<=-q.maxLoss))throw Error('LOSS_LIMIT');this.#halted=false;}
  status(){return {mode:'paper',realOrdersEnabled:false,halted:this.#halted,quotes:[...this.#quotes.values()].map(q=>({...q})),positions:[...this.#positions.values()].map(p=>({...p}))};}
  execute({id,action,symbol,baseAsset,quoteAsset,quantity,price,priceTime},now=Date.now()){
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('INVALID_ID');
    const key=JSON.stringify({action,symbol,baseAsset,quoteAsset,quantity,price,priceTime});const prior=this.#ids.get(id);if(prior){if(prior.key!==key)throw Error('ID_CONFLICT');return {...prior.result};}
    if(!['AL','SAT'].includes(action)||!/^([A-Z0-9]{1,20})_([A-Z0-9]{1,20})$/.test(symbol)||symbol!==`${baseAsset}_${quoteAsset}`||!positive(quantity)||!positive(price)||!Number.isSafeInteger(priceTime)||!Number.isSafeInteger(now)||priceTime>now||now-priceTime>30000)throw Error('INVALID_INPUT');
    if(this.#halted)throw Error('HALTED');const q=this.#quotes.get(quoteAsset);if(!q)throw Error('UNSUPPORTED_QUOTE');
    if(q.realized<=-q.maxLoss){this.#halted=true;throw Error('LOSS_LIMIT');}
    const gross=money(quantity,price,action==='AL');if(!positive(gross))throw Error('INVALID_INPUT');const slip=cost(gross,this.slippageBps),fee=cost(gross+slip,this.feeBps);let result;
    if(action==='AL'){
      if([...this.#positions.values()].some(p=>p.baseAsset===baseAsset))throw Error('RELATED_ASSET_EXPOSURE');
      const debit=gross+slip+fee,exposure=[...this.#positions.values()].filter(p=>p.quoteAsset===quoteAsset).reduce((sum,p)=>sum+p.entryCost,0);
      if(!Number.isSafeInteger(debit)||debit>q.cash||debit>q.maxTrade||debit>q.maxAsset||exposure+debit>q.maxExposure)throw Error('RISK_LIMIT');
      q.cash-=debit;q.fees+=fee;this.#positions.set(symbol,{symbol,baseAsset,quoteAsset,quantity,entryCost:debit});result={action,symbol,quantity,gross,fee,slippage:slip};
    }else{
      const p=this.#positions.get(symbol);if(!p||p.quantity!==quantity)throw Error('POSITION_REQUIRED');const credit=gross-slip-fee;if(!Number.isSafeInteger(credit)||credit<0||!Number.isSafeInteger(q.cash+credit))throw Error('INVALID_INPUT');
      q.cash+=credit;q.fees+=fee;const pnl=credit-p.entryCost;q.realized+=pnl;this.#positions.delete(symbol);if(q.realized<=-q.maxLoss)this.#halted=true;result={action,symbol,quantity,gross,fee,slippage:slip,realized:pnl};
    }
    this.#ids.set(id,{key,result});return {...result};
  }
}
