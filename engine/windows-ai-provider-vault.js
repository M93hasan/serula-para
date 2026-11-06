import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadVault } from './vault.js';

const PROVIDERS = Object.freeze(['openai', 'ollama_cloud', 'anthropic', 'gemini', 'deepseek']);
const validKey = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\u0000-\u0020\u007f]/.test(value);
const validModel = value => typeof value === 'string' && (value === '' || /^[A-Za-z0-9_.:-]{1,100}$/.test(value));
const validPrincipal = value => typeof value === 'string' && /^(local-desktop|google:[A-Za-z0-9_-]{1,256})$/.test(value);
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$payload = [Console]::In.ReadLine() | ConvertFrom-Json
$entropy = [Convert]::FromBase64String([string]$payload.entropy)
if ($payload.mode -eq 'protect') {
  $bytes = [Text.Encoding]::UTF8.GetBytes([string]$payload.value)
  $out = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($out))
} elseif ($payload.mode -eq 'unprotect') {
  $bytes = [Convert]::FromBase64String([string]$payload.value)
  $out = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($out))
} else { throw 'INVALID_MODE' }
`;

export function windowsDpapi({ mode, value, principal, provider }) {
  if (process.platform !== 'win32') throw Error('WINDOWS_KEYSTORE_REQUIRED');
  const entropy = createHash('sha256').update('PARA-AI-V2:' + principal + ':' + provider).digest('base64');
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')
  ], {
    input: JSON.stringify({ mode, value, entropy }) + '\n', encoding: 'utf8', timeout: 15000,
    maxBuffer: 1024 * 1024, windowsHide: true
  });
  if (result.error || result.status !== 0 || !result.stdout) throw Error('WINDOWS_KEYSTORE_UNAVAILABLE');
  return result.stdout.trim();
}

// Windows CurrentUser DPAPI is OS-bound. Principals are additionally segregated into
// separately authenticated namespaces. No static app-wide secret or plaintext fallback.
export class WindowsAIProviderVault {
  #dir; #protect; #busy = false;
  constructor({ directory, protector = windowsDpapi } = {}) {
    if (typeof directory !== 'string' || !directory || typeof protector !== 'function') throw Error('INVALID');
    this.#dir = directory; this.#protect = protector;
  }
  #path(principal, provider) {
    if (!validPrincipal(principal) || !PROVIDERS.includes(provider)) throw Error('INVALID');
    return join(this.#dir, 'users', fingerprint(principal), provider + '.dpapi');
  }
  #exclusive(callback) {
    if (this.#busy) throw Error('BUSY');
    this.#busy = true;
    try { return callback(); } finally { this.#busy = false; }
  }
  #read(principal, provider) {
    const file = this.#path(principal, provider);
    const raw = readFileSync(file, 'utf8');
    let envelope;
    try { envelope = JSON.parse(raw); } catch { throw Error('INVALID_VAULT'); }
    if (envelope?.version !== 2 || typeof envelope.data !== 'string' || envelope.data.length > 8192) throw Error('INVALID_VAULT');
    let credentials;
    try { credentials = JSON.parse(this.#protect({ mode: 'unprotect', value: envelope.data, principal, provider })); }
    catch { throw Error('WINDOWS_KEYSTORE_UNAVAILABLE'); }
    if (credentials?.provider !== provider || credentials?.principal !== principal ||
      !validKey(credentials.apiKey) || !validModel(credentials.model)) throw Error('INVALID_VAULT');
    return { apiKey: credentials.apiKey, model: credentials.model };
  }
  status({ principal } = {}) {
    return PROVIDERS.map(provider => ({ provider, configured: existsSync(this.#path(principal, provider)) }));
  }
  openForAnalysis({ principal, provider } = {}) {
    return this.#exclusive(() => this.#read(principal, provider));
  }
  #store({ principal, provider, apiKey, model = '', replace = false }) {
    const path = this.#path(principal, provider);
    if (!validKey(apiKey) || !validModel(model) || typeof replace !== 'boolean') throw Error('INVALID');
    if (existsSync(path) !== replace) throw Error('STATE_CHANGED');
    const data = this.#protect({
      mode: 'protect', value: JSON.stringify({ principal, provider, apiKey, model }), principal, provider
    });
    if (typeof data !== 'string' || !data || data.length > 8192) throw Error('WINDOWS_KEYSTORE_UNAVAILABLE');
    const sealed = JSON.stringify({ version: 2, data });
    mkdirSync(join(this.#dir, 'users', fingerprint(principal)), { recursive: true, mode: 0o700 });
    if (!replace) { writeFileSync(path, sealed, { flag: 'wx', mode: 0o600 }); return; }
    const temp = path + '.' + randomBytes(12).toString('hex') + '.tmp';
    try { writeFileSync(temp, sealed, { flag: 'wx', mode: 0o600 }); renameSync(temp, path); }
    finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
  save(input = {}) {
    return this.#exclusive(() => this.#store(input));
  }
  remove({ principal, provider } = {}) {
    return this.#exclusive(() => { this.#read(principal, provider); unlinkSync(this.#path(principal, provider)); });
  }
  // Explicit legacy migration: password is only needed once for an existing v1 vault.
  // Original encrypted vault is deliberately retained until the user removes it separately.
  migrate({ principal, provider, passphrase } = {}) {
    return this.#exclusive(() => {
      const target = this.#path(principal, provider);
      if (existsSync(target)) throw Error('STATE_CHANGED');
      if (typeof passphrase !== 'string' || passphrase.length < 16) throw Error('INVALID');
      if (!PROVIDERS.includes(provider) || !validPrincipal(principal)) throw Error('INVALID');
      const legacy = loadVault(join(this.#dir, provider + '.vault'), passphrase);
      if (legacy.secretKey !== 'para-ai-provider:' + provider || !validKey(legacy.apiKey) || !validModel(legacy.model)) throw Error('INVALID_VAULT');
      this.#store({ principal, provider, apiKey: legacy.apiKey, model: legacy.model, replace: false });
    });
  }
}
