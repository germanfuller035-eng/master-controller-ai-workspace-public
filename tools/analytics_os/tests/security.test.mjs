#!/usr/bin/env node
// tools/analytics_os/tests/security.test.mjs
// Security + invariant scan over Analytics OS. No secrets, no send, no tracking, no new dashboards,
// no canonical writes, no production mutation.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInvariants } from '../lib/validators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEN = path.resolve(ROOT, '../../_generated/analytics_os');

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

function walk(dir) { const out = []; if (!existsSync(dir)) return out; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) out.push(...walk(p)); } else out.push(p); } return out; }
const files = [...walk(ROOT), ...walk(GEN)].filter((f) => /\.(mjs|js|json|md|txt|html)$/.test(f) && statSync(f).size < 2 * 1024 * 1024);

const SECRET_RX = [
  { name: 'telegram_token', re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/ },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'password_assign', re: /(PASSWORD|SMTP_PASS|API_KEY)\s*[:=]\s*["']?[^\s"',}]{8,}/i },
];
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!.*\.test\b)(?!example\.)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/;
// The privacy validator needs a known-bad example to test against; it is fenced to this single file
// and explicitly marked. It is NOT real data (acme.com placeholder) and is never emitted to samples.
const PRIVACY_FIXTURE = 'fixtures/domain_fixtures.json';

let secretHits = 0, sendHits = 0, prodHits = 0, trackHits = 0, dashHits = 0, writeHits = 0, contactHits = 0;
let liveReadHits = 0, prodApiHits = 0, experimentRunHits = 0;
for (const f of files) {
  const txt = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const isTestOrComment = /tests\//.test(rel);
  const isPrivacyFixture = rel.endsWith(PRIVACY_FIXTURE);
  if (!isPrivacyFixture) for (const s of SECRET_RX) if (s.re.test(txt)) { secretHits++; console.log(`  secret-like (${s.name}) in ${rel}`); }
  if (!isTestOrComment) {
    if (/(nodemailer|createTransport|\.sendMail\s*\(|bot\.sendMessage\s*\()/.test(txt)) { sendHits++; console.log(`  send in ${rel}`); }
    if (/(ssh2|195\.96\.132\.82|exec.*systemctl|\.deploy\()/.test(txt)) { prodHits++; console.log(`  prod access in ${rel}`); }
    // tracking pixels / analytics beacons / event emitters to external collectors
    if (/(gtag\(|analytics\.track\(|fbq\(|navigator\.sendBeacon|new Image\(\)\.src)/.test(txt)) { trackHits++; console.log(`  tracking in ${rel}`); }
    // creating a new dashboard artifact (we only reference existing ones)
    if (/createDashboard\s*\(|new Dashboard\s*\(|registerDashboard\s*\(/.test(txt)) { dashHits++; console.log(`  dashboard creation in ${rel}`); }
    // writing outside _generated (canonical write attempt)
    if (/writeFileSync\([^)]*tools\/(revenue_os|finance_os|delivery_os|executive_os|product_os|customer_success_os|ai_hq)\//.test(txt)) { writeHits++; console.log(`  canonical write in ${rel}`); }
    // live canonical read wiring (e.g. reading another OS runtime store/db)
    if (/(fetch\(|http\.request|https\.request|new\s+Client\(|\.connect\(|readFileSync\([^)]*\/(canonical|store|data)\/.*\.(db|sqlite))/.test(txt)) { liveReadHits++; console.log(`  live canonical read in ${rel}`); }
    // production API client
    if (/(MasterController(Api|Client)|mater_controller_api|api_base_url|VPS_API|production.*endpoint)/i.test(txt)) { prodApiHits++; console.log(`  production API in ${rel}`); }
    // actually starting an experiment / cycle
    if (/(startExperiment\s*\(|runExperiment\s*\(|launchCycle\s*\(|beginCommercialCycle\s*\()/.test(txt)) { experimentRunHits++; console.log(`  experiment run in ${rel}`); }
  }
  if (/fixtures|samples|generated/.test(rel) && !isPrivacyFixture && REAL_EMAIL_RX.test(txt)) { contactHits++; console.log(`  real email in ${rel}`); }
}

ok('NO_SECRET_OUTPUT', secretHits === 0, `hits=${secretHits}`);
ok('NO_SEND_METHOD', sendHits === 0, `hits=${sendHits}`);
ok('no production access', prodHits === 0, `hits=${prodHits}`);
ok('NO_TRACKING_INSTALL', trackHits === 0, `hits=${trackHits}`);
ok('no dashboard creation', dashHits === 0, `hits=${dashHits}`);
ok('no canonical writes', writeHits === 0, `hits=${writeHits}`);
ok('NO_REAL_DATA (no real contact in samples)', contactHits === 0, `hits=${contactHits}`);
ok('NO_LIVE_CANONICAL_READ', liveReadHits === 0, `hits=${liveReadHits}`);
ok('NO_PRODUCTION_API', prodApiHits === 0, `hits=${prodApiHits}`);
ok('no experiment/cycle execution', experimentRunHits === 0, `hits=${experimentRunHits}`);
ok('invariants locked', validateInvariants().length === 0, validateInvariants().join('; '));

// Proposed docs must be marked NOT_APPLIED and have a canonical_target link.
const proposedDir = path.resolve(ROOT, '../../docs_canonical_proposed');
const proposed = walk(proposedDir).filter((f) => f.endsWith('.md') && /related_project:\s*analytics-os/.test(readFileSync(f, 'utf8')));
let badProposed = 0;
for (const f of proposed) { const t = readFileSync(f, 'utf8'); if (!/canonical_target:/.test(t) || !/PROPOSED_NOT_APPLIED/.test(t)) { badProposed++; console.log(`  bad proposed doc ${path.basename(f)}`); } }
ok('proposed docs marked NOT_APPLIED + linked', badProposed === 0 && proposed.length > 0, `count=${proposed.length} bad=${badProposed}`);

// All sample/report OUTPUT files (under a _generated tree) must live under _generated/analytics_os only.
const strayOut = files.filter((f) => /_generated[\\/]/.test(f) && /[\\/](samples|reports)[\\/]/.test(f) && !path.resolve(f).startsWith(path.resolve(GEN)));
ok('all generated artifacts under _generated/analytics_os', strayOut.length === 0, `stray=${strayOut.length}`);

console.log(`\nsecurity.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
