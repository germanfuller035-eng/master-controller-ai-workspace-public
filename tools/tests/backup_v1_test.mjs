/**
 * backup_v1_test.mjs — Backup & Recovery Center backend scenario lab.
 *
 * OFFLINE. No network. No SMTP. No send. Points every store path at a TEMP dir,
 * writes synthetic stores + .bak_ snapshots, and verifies: inventory, backup status
 * (freshness, missing-backup honesty), NON-DESTRUCTIVE restore drill (live file never
 * modified), corrupt-snapshot detection, and rollback instructions (never executed).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate ALL store paths into a temp dir BEFORE importing the module.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mc_backup_test_'));
const storeFile = path.join(DIR, 'lead_pipeline_store.json');
process.env.MATER_STORE_PATH = storeFile; // dirname(STORE_PATH) drives every other default path
process.env.MATER_OWNER_CENTER_STORE_PATH = path.join(DIR, 'owner_center_store.json');
process.env.MATER_CAMPAIGNS_STORE_PATH = path.join(DIR, 'campaigns_store.json');
process.env.MATER_KNOWLEDGE_STORE_PATH = path.join(DIR, 'knowledge_radar_store.json');
process.env.MATER_OWNER_SETTINGS_PATH = path.join(DIR, 'owner_automation_settings.json');
process.env.MATER_DOMAIN_RESERVOIR_PATH = path.join(DIR, 'domain_reservoir.json');
process.env.MATER_AI_USAGE_LEDGER_PATH = path.join(DIR, 'ai_usage_ledger.jsonl');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== Backup & Recovery Center — Scenario Lab ===\n');

const bc = await import('../mater_controller_api/src/owner_center/backup_center.mjs');

// Seed: canonical store + a snapshot, and an AI ledger. Some files intentionally absent.
fs.writeFileSync(storeFile, JSON.stringify({ store_revision: 42, leads: [{ id: 'L1' }] }, null, 2) + '\n', 'utf8');
fs.writeFileSync(`${storeFile}.bak_2026-06-20T10-00-00-000Z`, JSON.stringify({ store_revision: 41, leads: [{ id: 'L1' }] }, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(DIR, 'ai_usage_ledger.jsonl'), '{"usage_key":"a","calculated_units":10}\n{"usage_key":"b","calculated_units":20}\n', 'utf8');

// 1. inventory
console.log('Scenario: protected inventory');
const inv = bc.protectedInventory();
check('inventory has 9 items', inv.length === 9);
check('canonical marked critical', inv.find((i) => i.key === 'canonical_leads').critical === true);
check('ledgers marked critical', inv.find((i) => i.key === 'send_ledger').critical === true);

// 2. backup status
console.log('Scenario: backup status');
const st = bc.backupStatus();
const canon = st.items.find((i) => i.key === 'canonical_leads');
check('canonical live exists', canon.live_exists === true);
check('canonical has backup', canon.has_backup === true && canon.snapshot_count === 1);
check('latest snapshot surfaced', canon.latest_snapshot?.file?.startsWith('lead_pipeline_store.json.bak_') === true);
check('age hours is a number', typeof canon.latest_age_hours === 'number');
const settings = st.items.find((i) => i.key === 'owner_settings');
check('absent file → live_exists false', settings.live_exists === false);
check('absent file → no backup (honest)', settings.has_backup === false && settings.latest_age_hours === null);
check('critical missing-backup list honest', Array.isArray(st.critical_missing_backup));

// 3. content validation
console.log('Scenario: content validation');
check('revisioned json valid + revision', bc.validateContent('json_revisioned', JSON.stringify({ store_revision: 5 })).revision === 5);
check('revisioned without revision invalid', bc.validateContent('json_revisioned', JSON.stringify({})).valid === false);
check('corrupt json invalid', bc.validateContent('json', '{bad json').valid === false);
check('jsonl counts lines', bc.validateContent('jsonl', '{"a":1}\n{"b":2}\n').lines === 2);

// 4. NON-DESTRUCTIVE restore drill
console.log('Scenario: restore drill (non-destructive)');
const liveBefore = fs.readFileSync(storeFile, 'utf8');
const liveMtimeBefore = fs.statSync(storeFile).mtimeMs;
const drill = bc.restoreDrill('canonical_leads');
check('drill ok + restorable', drill.ok && drill.restorable === true);
check('drill used snapshot', drill.source === 'snapshot');
check('drill non-destructive flag', drill.drill === 'NON_DESTRUCTIVE' && drill.live_touched === false);
check('drill detected revision 41', drill.revision === 41);
const liveAfter = fs.readFileSync(storeFile, 'utf8');
check('LIVE FILE BYTE-IDENTICAL after drill', liveAfter === liveBefore);
check('LIVE FILE MTIME unchanged after drill', fs.statSync(storeFile).mtimeMs === liveMtimeBefore);
// no temp drill files left behind
const leftover = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('mc_restore_drill_'));
check('no temp drill files leaked', leftover.length === 0);

// 5. drill on ledger (jsonl, no snapshot → uses live)
console.log('Scenario: drill on ledger (live source)');
const drillLedger = bc.restoreDrill('ai_usage_ledger');
check('ledger drill restorable', drillLedger.restorable === true);
check('ledger drill source live', drillLedger.source === 'live');

// 6. corrupt snapshot detected
console.log('Scenario: corrupt snapshot detection');
fs.writeFileSync(path.join(DIR, 'campaigns_store.json.bak_2026-06-20T09-00-00-000Z'), '{ corrupt', 'utf8');
const drillBad = bc.restoreDrill('campaigns');
check('corrupt snapshot → not restorable', drillBad.restorable === false);

// 7. drill-all summary
console.log('Scenario: restore drill all');
const all = bc.restoreDrillAll();
check('drill-all live never touched', all.live_touched === false);
check('drill-all reports restorable count', all.restorable >= 2);
check('canonical critical restorable', all.results.find((r) => r.key === 'canonical_leads').restorable === true);

// 8. rollback instructions (never executed)
console.log('Scenario: rollback instructions');
const rb = bc.rollbackInstructions('canonical_leads');
check('rollback owner-manual', rb.auto_executed === false && rb.executed_by === 'OWNER_MANUAL');
check('rollback has steps', rb.steps_ru.length >= 3);
const rbNoSnap = bc.rollbackInstructions('domain_reservoir');
check('rollback w/o snapshot → unavailable note', rbNoSnap.steps_ru[0].includes('Снимков нет'));
check('unknown key rejected', bc.rollbackInstructions('nope').ok === false);

// 9. no-send / no-execute invariant
console.log('Scenario: no-send / no-restore-execute invariant');
check('status sends false', st.sends === false && st.performs_restore === false);
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'backup_center.mjs'), 'utf8');
check('no nodemailer/smtp in backup center', !/nodemailer|createTransport/i.test(src));
check('backup center never executes a live restore (no renameSync to store)', !/renameSync\s*\(/.test(src));
check('backup center only writes temp drill files', !/writeFileSync\([^)]*storePath/i.test(src) && /tmpDir/.test(src));

// cleanup
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
