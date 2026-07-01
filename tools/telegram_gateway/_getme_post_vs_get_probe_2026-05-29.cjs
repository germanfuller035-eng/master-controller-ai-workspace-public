// Differential probe: getMe via POST(JSON), POST(empty), GET. Also: fresh agent (no keepAlive).
// Reads token via env loader without printing it.
const https = require('node:https');
const dns = require('node:dns');
const fs = require('node:fs');
const path = require('node:path');

function loadToken() {
  // try AI_SECRETS first, then .env
  const candidates = [
    'D:/AI_WORKSPACE/tools/telegram_gateway/.env',
    'D:/AI_WORKSPACE/.env',
    'D:/AI_SECRETS/.env',
  ];
  for (const f of candidates) {
    try {
      if (!fs.existsSync(f)) continue;
      const txt = fs.readFileSync(f, 'utf-8');
      for (const ln of txt.split(/\r?\n/)) {
        const m = ln.match(/^\s*(TELEGRAM_BOT_TOKEN|BOT_TOKEN)\s*=\s*(.+)\s*$/);
        if (m) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          return v;
        }
      }
    } catch (_) {}
  }
  return process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
}

const TOKEN = loadToken();
if (!TOKEN) { console.log('NO_TOKEN'); process.exit(0); }

function ipv4Lookup(h, _o, cb) { return dns.lookup(h, { family: 4 }, cb); }

function probe(label, optsOverride, body) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const baseOpts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TOKEN}/getMe`,
      method: 'GET',
      family: 4,
      lookup: ipv4Lookup,
      timeout: 15000,
      headers: {
        'User-Agent': 'probe',
        'Accept': 'application/json',
        'Connection': 'close',
      },
    };
    const opts = Object.assign({}, baseOpts, optsOverride || {});
    if (body) {
      opts.headers = Object.assign({}, opts.headers, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
    }
    const req = https.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const lat = Date.now() - t0;
        const raw = Buffer.concat(chunks).toString('utf-8');
        let parsed = null; try { parsed = JSON.parse(raw); } catch (_) {}
        const username = parsed && parsed.ok && parsed.result ? parsed.result.username : null;
        console.log(`[${label}] ok=${!!(parsed && parsed.ok)} status=${res.statusCode} username=${username || '-'} lat=${lat}ms`);
        resolve();
      });
    });
    req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch(_){} });
    req.on('error', (e) => {
      const lat = Date.now() - t0;
      console.log(`[${label}] ok=false error=${(e && e.message || e).toString().slice(0,60)} lat=${lat}ms`);
      resolve();
    });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  await probe('GET_close', { method: 'GET' });
  await probe('POST_empty_close', { method: 'POST' }, '');
  await probe('POST_json_close', { method: 'POST' }, '{}');
  // try without explicit Connection close
  await probe('GET_default_hdr', { method: 'GET', headers: { 'User-Agent': 'probe', 'Accept': 'application/json' } });
})();
