import { homedir } from 'node:os';
import { join } from 'node:path';
import { saveVault } from './vault.js';

async function secret(prompt) {
  if(!process.stdin.isTTY) throw Error('Interactive terminal required');
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve,reject)=>{let s=''; function input(chunk){for(const ch of chunk.toString('utf8')) {if(ch==='\u0003'){cleanup();reject(Error('Cancelled'));return;} if(ch==='\r'||ch==='\n'){cleanup();process.stdout.write('\n');resolve(s);return;} if(ch==='\u007f'||ch==='\b')s=s.slice(0,-1);else if(ch>=' ')s+=ch;}} function cleanup(){process.stdin.removeListener('data',input);process.stdin.setRawMode(false);process.stdin.pause();} process.stdin.on('data',input);});
}
try {
  const apiKey=await secret('Binance TR API key (hidden): '), secretKey=await secret('Binance TR secret (hidden): '), pass=await secret('Vault passphrase (16+ characters, hidden): '), repeat=await secret('Repeat passphrase: ');
  if(pass!==repeat) throw Error('Passphrases do not match');
  saveVault(join(homedir(),'.para','binance-tr.vault'),{apiKey,secretKey},pass); console.log('Encrypted vault created. Existing vaults are not overwritten.');
} catch(e) { console.error(e.message); process.exitCode=1; }
