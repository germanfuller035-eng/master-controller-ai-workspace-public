#!/usr/bin/env node
// tools/growth_os/tests/security.test.mjs
// Security scan over Growth OS: no production, no live reads, no send, no publication, no tracking,
// no ads, no secrets, no real contacts. The negative-example fixture block is fenced + intentional.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEND_ALLOWED, PUBLISH_ALLOWED, TRACKING_ALLOWED, ADS_ALLOWED, PRODUCTION_READ_ALLOWED, CANONICAL_WRITE_ALLOWED, CAMPAIGN_ACTIVE_ALLOWED, EXPERIMENT_RUNNING_ALLOWED } from '../lib/common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/growth_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt|html)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(password|smtp_pass|api_key|secret)["']?\s*[:=]\s*["']?[^\s"',}]{8,}/i },
];
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)(?!.*acme\.test)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
// The negative-example fixture intentionally carries a flaggable contact to test the privacy validator.
const NEG_FIXTURE = 'fixtures/growth_fixtures.json';

let secret = 0, send = 0, publish = 0, track = 0, ads = 0, prod = 0, liveRead = 0, contact = 0;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const isTest = /tests\//.test(rel);
  const isNeg = rel.endsWith(NEG_FIXTURE);
  if (!isNeg) for (const s of SECRET_RX) if (s.re.test(txt)) { secret++; console.log(`  secret (${s.name}) in ${rel}`); }
  if (!isTest) {
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\(|smtp\.send)/.test(txt)) { send++; console.log(`  send in ${rel}`); }
    if (/(publishPost\s*\(|deployLanding\s*\(|publishLanding\s*\(|\.publish\s*\(|cms\.create)/.test(txt)) { publish++; console.log(`  publish in ${rel}`); }
    if (/(gtag\(|analytics\.track\(|fbq\(|navigator\.sendBeacon|new Image\(\)\.src|yandex\.metrika|ym\()/.test(txt)) { track++; console.log(`  tracking in ${rel}`); }
    if (/(google\.ads|adwords|facebook\.ads|createAd\s*\(|adsManager)/.test(txt)) { ads++; console.log(`  ads in ${rel}`); }
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl|\.deploy\(|mater_controller_api|MasterControllerApi)/.test(txt)) { prod++; console.log(`  prod access in ${rel}`); }
    if (/(fetch\(\s*['"]https?:|http\.request|https\.request|\.connect\(.*db|live_canonical)/.test(txt)) { liveRead++; console.log(`  live read in ${rel}`); }
  }
  if (/fixtures|samples|generated|data\//.test(rel) && !isNeg && REAL_EMAIL_RX.test(txt)) { contact++; console.log(`  real contact in ${rel}`); }
}

ok('NO_SECRET_OUTPUT', secret === 0, `hits=${secret}`);
ok('NO_SEND_METHOD', send === 0, `hits=${send}`);
ok('NO_PUBLICATION_METHOD', publish === 0, `hits=${publish}`);
ok('NO_TRACKING_INSTALL', track === 0, `hits=${track}`);
ok('NO_ADS_CREATION', ads === 0, `hits=${ads}`);
ok('NO_PRODUCTION_API', prod === 0, `hits=${prod}`);
ok('NO_LIVE_CANONICAL_READ', liveRead === 0, `hits=${liveRead}`);
ok('NO_REAL_CONTACTS_IN_FIXTURES', contact === 0, `hits=${contact}`);

// Invariants locked
ok('SEND_ALLOWED false', SEND_ALLOWED === false);
ok('PUBLISH_ALLOWED false', PUBLISH_ALLOWED === false);
ok('TRACKING_ALLOWED false', TRACKING_ALLOWED === false);
ok('ADS_ALLOWED false', ADS_ALLOWED === false);
ok('PRODUCTION_READ_ALLOWED false', PRODUCTION_READ_ALLOWED === false);
ok('CANONICAL_WRITE_ALLOWED false', CANONICAL_WRITE_ALLOWED === false);
ok('CAMPAIGN_ACTIVE_ALLOWED false', CAMPAIGN_ACTIVE_ALLOWED === false);
ok('EXPERIMENT_RUNNING_ALLOWED false', EXPERIMENT_RUNNING_ALLOWED === false);

// Generated outputs must live under _generated/growth_os only
const stray = files.filter((f) => /_generated[\\/]/.test(f) && /[\\/](samples|reports)[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('all generated artifacts under _generated/growth_os', stray.length === 0, `stray=${stray.length}`);

console.log(`\nsecurity.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
