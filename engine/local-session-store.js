import {mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes, createHash} from 'node:crypto';

export const SESSION_COOKIE = 'para_local_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('base64url');
export const newToken = () => randomBytes(32).toString('base64url');
export const sessionCookie = (token, age = SESSION_TTL_MS / 1000) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`;
export function cookieToken(cookie) {
  if (typeof cookie !== 'string' || cookie.length > 4096) return null;
  const entry = cookie.split(';').map(x=>x.trim()).find(x => x.startsWith(SESSION_COOKIE + '='));
  const token = entry?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
/** Hash-only session state. Location is per-user, not shared with a web server. */
export class LocalSessionStore {
  constructor({path = join(homedir(), '.para', 'auth-sessions.json'), clock = Date.now} = {}) {
    this.path = path; this.clock = clock;
    this.sessions = new Map();
    try {
      const raw = JSON.parse(readFileSync(path,'utf8'));
      if (!Array.isArray(raw) || raw.length > 200) throw Error('INVALID_SESSIONS');
      for (const [key,val] of raw) {
        if (/^[A-Za-z0-9_-]{43}$/.test(key) && val &&
            typeof val.id === 'string' && val.id.length <= 300 &&
            Number.isSafeInteger(val.expires) && val.expires > clock() &&
            val.expires <= clock() + SESSION_TTL_MS) this.sessions.set(key,val);
      }
    } catch(e) { if(e.code !== 'ENOENT') throw Error('Session storage unreadable'); }
  }
  save() {
    mkdirSync(dirname(this.path), {recursive:true,mode:0o700});
    const temp = this.path + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(temp, JSON.stringify([...this.sessions]), {mode:0o600,flag:'wx'});
    renameSync(temp,this.path);
    chmodSync(this.path,0o600);
  }
  cleanup() {
    let changed = false;
    for(const [key,val] of this.sessions) if(val.expires <= this.clock()) {this.sessions.delete(key); changed=true;}
    if(changed)this.save();
  }
  create(identity) {
    this.cleanup();
    if(this.sessions.size >= 100) throw Error('SESSION_LIMIT');
    const token = newToken();
    const entry = {id:identity.id, email:identity.email || null, provider:identity.provider,
      expires:this.clock()+SESSION_TTL_MS};
    this.sessions.set(hash(token),entry);this.save();
    return token;
  }
  user(cookie) {
    const token=cookieToken(cookie);if(!token)return null;
    this.cleanup();
    return this.sessions.get(hash(token))||null;
  }
  revoke(cookie) {
    const token=cookieToken(cookie);
    if(token && this.sessions.delete(hash(token)))this.save();
  }
}
