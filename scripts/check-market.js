// Public endpoints only: no vault, API keys, account balances or order functions.
import { MarketData } from '../engine/market-data.js';
try {
  const result=await new MarketData().snapshot();
  for(const symbol of ['BTC_TRY','ETH_TRY']) {
    const m=result.markets.find(x=>x.symbol===symbol);
    if(!m)throw Error(`${symbol}: piyasa verisi yok`);
    console.log(`${symbol}: son fiyat ${m.price} TRY (${new Date(m.priceTime).toISOString()}), ${m.candles.length} kapalı saatlik mum, son kapanış ${new Date(m.candles.at(-1).closeTime).toISOString()}`);
  }
  console.log('Piyasa kontrolü başarılı. Hesap bilgileri kullanılmadı.');
} catch(error) {const reason=error.message==='Market region restricted'?'Binance TR bu ağ veya bölgeden erişimi kısıtlıyor':error.message;console.error(`Piyasa kontrolü başarısız: ${reason}. Ağ, saat ve Binance TR erişimini kontrol edin; 30 saniye sonra yeniden deneyin.`);process.exitCode=1;}
