// Safe env check — prints presence flags only. Does NOT print token/full chat_id.
import fs from 'node:fs';
function parse(f){
  const r = {};
  if (!fs.existsSync(f)) return r;
  const txt = fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'');
  for (const l of txt.split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const e = t.indexOf('=');
    if (e < 0) continue;
    r[t.substring(0,e).trim()] = t.substring(e+1).trim().replace(/^["']|["']$/g,'');
  }
  return r;
}
const fA = 'D:/AI_WORKSPACE/tools/telegram_gateway/.env';
const fB = 'D:/AI_WORKSPACE/.env';
const eA = parse(fA);
const eB = parse(fB);
console.log('gateway/.env exists:', fs.existsSync(fA));
console.log('root/.env exists:', fs.existsSync(fB));
console.log('keys gateway/.env:', Object.keys(eA).join(','));
console.log('keys root/.env:', Object.keys(eB).join(','));
const E = { ...eB, ...eA };
const tok = E.TELEGRAM_BOT_TOKEN || E.BOT_TOKEN || '';
const ch = E.TELEGRAM_CHAT_ID || E.TELEGRAM_ADMIN_CHAT_ID || E.CHAT_ID || E.TELEGRAM_OWNER_CHAT_ID || '';
console.log('BOT_TOKEN present:', tok ? 'yes' : 'no');
console.log('CHAT_ID present:', ch ? 'yes' : 'no');
console.log('CHAT_ID last4:', ch ? String(ch).slice(-4) : '(none)');
