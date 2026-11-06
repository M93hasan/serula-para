// Offline Windows soak: synthetic orders, SQLite restart and leak guard.
// Never import live BinanceTROrderClient or contact the network.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveOrderJournal} from '../engine/live-order-journal.js';
import {LiveRiskEngine} from '../engine/live-risk-engine.js';

const minutes=Number(process.env.PARA_SOAK_MINUTES||'1');
if(!Number.isFinite(minutes)||minutes<0.1||minutes>60)throw Error('INVALID_SOAK_DURATION');
const end=Date.now()+minutes*60000,dir=mkdtempSync(join(tmpdir(),'para-soak-'));
const initial=process.memoryUsage().rss;
let i=0;
try{
 while(Date.now()<end){
  const file=join(dir,'journal.sqlite');
  let j=new LiveOrderJournal(file);
  const now=Date.now();
  const risk=new LiveRiskEngine({journal:j,clock:()=>now});
  assert.equal(risk.status().halted,true);
  const clientId='para_soak_'+String(i).padStart(12,'0');
  const intent={clientId,symbol:'BTC_TRY',side:'BUY',quantity:'0.001',price:'100000',notional:'100'};
  j.reserve(intent,now);
  j.setStatus(clientId,'UNKNOWN',now);
  assert.throws(()=>j.reserve({...intent,clientId:'para_duplicate_'+String(i).padStart(8,'0')},now),/DUPLICATE_ACTIVE_ORDER/);
  risk.close();j.close();
  j=new LiveOrderJournal(file);
  assert.equal(j.get(clientId).status,'UNKNOWN');
  j.observe(clientId,{clientId,symbol:'BTC_TRY',orderId:i+1,side:0,type:1,price:'100000',status:2,origQty:'0.001',executedQty:'0.001',executedQuoteQty:'100'},now);
  assert.equal(j.get(clientId).status,'FILLED');
  j.close();
  i++;
  if(i%50===0){
   const rss=process.memoryUsage().rss;
   if(rss>initial+256*1024*1024)throw Error('POSSIBLE_MEMORY_GROWTH');
   process.stdout.write('Completed '+i+' offline restart cycles; rss='+Math.round(rss/1048576)+' MiB\n');
   await new Promise(r=>setTimeout(r,40));
  }
 }
 process.stdout.write('SOAK_PASS cycles='+i+' minutes='+minutes+' realOrders=disabled network=none\n');
}finally{rmSync(dir,{recursive:true,force:true});}
