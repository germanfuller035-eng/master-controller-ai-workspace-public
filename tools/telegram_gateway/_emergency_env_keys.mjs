// Lists ENV variable KEYS only (no values) from candidate .env files. Safe.
import fs from 'node:fs';
import path from 'node:path';

const candidates = [
  'D:/AI_WORKSPACE/tools/telegram_gateway/.env',
  'D:/AI_WORKSPACE/.env',
  'D:/AI_WORKSPACE/13_sales/daily_lead_factory/.env',
  'D:/AI_WORKSPACE/13_sales/daily_lead_factory/bot/.env',
];

for (const p of candidates) {
  if (!fs.existsSync(p)) { console.log('MISS:', p); continue; }
  const raw = fs.readFileSync(p, 'utf8');
  const keys = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) keys.push(m[1]);
  }
  console.log('FILE:', p);
  console.log('KEYS:', keys.join(', '));
  console.log('---');
}
