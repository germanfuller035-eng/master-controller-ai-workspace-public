// seed_acceptance_fixtures.mjs — server-side TEST_ONLY fixture seeder for Android acceptance v3.
// Runs ON THE VPS only. Imports owner_center/service.mjs and calls its exported create
// functions directly through the same atomic+locked mutate() the live server uses.
// NO secret is read or printed. Writes ONLY test_only=true records. Never sends.
//
// Modes:  node seed_acceptance_fixtures.mjs seed <RUN_ID>
//         node seed_acceptance_fixtures.mjs verify
//         node seed_acceptance_fixtures.mjs cleanup           (purges ALL test_only records)
//
// Every fixture is marked: test_only=true, and (where the schema allows metadata)
// { no_send:true, excluded_from_commercial_KPI:true, created_by_run_id, cleanup_supported:true }.

import fs from 'fs';
import * as owner from './src/owner_center/service.mjs';
import * as campaigns from './src/campaigns/service.mjs';
import { OWNER_CENTER_STORE_PATH, CAMPAIGNS_STORE_PATH } from './src/shared/config.mjs';

const mode = process.argv[2] || 'verify';
const RUN_ID = process.argv[3] || 'acceptance_v3';

const marker = { no_send: true, excluded_from_commercial_KPI: true, created_by_run_id: RUN_ID, cleanup_supported: true };
const TAG = '[ACCEPT_V3]';

function counts() {
  const s = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8'));
  const co = (a) => (a || []).filter((x) => x.test_only).length;
  return {
    events_test: co(s.events), notif_test: co(s.notifications),
    decisions_test: co(s.decisions), incidents_test: co(s.incidents),
    events_total: (s.events || []).length, notif_total: (s.notifications || []).length,
    decisions_total: (s.decisions || []).length, incidents_total: (s.incidents || []).length,
    campaigns_test: campaignCounts().test, campaigns_total: campaignCounts().total,
  };
}

function campaignCounts() {
  try {
    const c = JSON.parse(fs.readFileSync(CAMPAIGNS_STORE_PATH, 'utf8'));
    const map = c.campaigns || {};
    const arr = Object.values(map);
    return { test: arr.filter((x) => x.test_only).length, total: arr.length };
  } catch { return { test: 0, total: 0 }; }
}

if (mode === 'verify') {
  console.log('VERIFY ' + JSON.stringify(counts()));
  process.exit(0);
}

if (mode === 'cleanup') {
  // Legitimate cleanup of TEST data only — real records (test_only=false) are untouched.
  const s = JSON.parse(fs.readFileSync(OWNER_CENTER_STORE_PATH, 'utf8'));
  const before = counts();
  for (const k of ['events', 'notifications', 'decisions', 'incidents']) {
    if (Array.isArray(s[k])) s[k] = s[k].filter((x) => !x.test_only);
  }
  // atomic temp+rename (same discipline as store_access)
  const tmp = `${OWNER_CENTER_STORE_PATH}.tmp_cleanup_${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, OWNER_CENTER_STORE_PATH);
  // campaigns store: drop test_only campaigns
  try {
    const c = JSON.parse(fs.readFileSync(CAMPAIGNS_STORE_PATH, 'utf8'));
    if (c.campaigns && typeof c.campaigns === 'object') {
      for (const [id, camp] of Object.entries(c.campaigns)) if (camp.test_only) delete c.campaigns[id];
      const ctmp = `${CAMPAIGNS_STORE_PATH}.tmp_cleanup_${process.pid}`;
      fs.writeFileSync(ctmp, JSON.stringify(c, null, 2) + '\n', 'utf8');
      fs.renameSync(ctmp, CAMPAIGNS_STORE_PATH);
    }
  } catch { /* campaigns store may not exist */ }
  console.log('CLEANUP_BEFORE ' + JSON.stringify(before));
  console.log('CLEANUP_AFTER ' + JSON.stringify(counts()));
  process.exit(0);
}

if (mode === 'seed') {
  const out = [];
  // --- 4 events/notifications at P0..P3 → covers NOTIFICATION_P0/P1/P2/P3 ---
  const sevs = ['P0', 'P1', 'P2', 'P3'];
  for (const sev of sevs) {
    const r = owner.publishEvent({
      event_type: 'ACCEPTANCE_PROBE', severity: sev, entity_type: 'SERVICE',
      title_ru: `${TAG} Тестовое событие ${sev}`,
      summary_ru: `TEST_ONLY проба уведомления уровня ${sev}. Без отправки.`,
      impact_ru: 'Нет влияния — приёмочная проба.',
      owner_action_required: sev === 'P0' || sev === 'P1',
      deduplication_key: `${RUN_ID}_evt_${sev}`,
      test_only: true, metadata: { ...marker, severity_probe: sev },
    });
    out.push({ kind: 'event', sev, ok: r.ok, notificationId: r.notificationId, idempotent: !!r.idempotent });
  }
  // --- 1 open owner decision → covers OWNER_DECISION_OPEN ---
  const d = owner.createDecision({
    category: 'SYSTEM', priority: 'P1',
    title_ru: `${TAG} Тестовое решение владельца`,
    facts: [`${TAG} TEST_ONLY`, `run_id=${RUN_ID}`, 'no_send=true', 'excluded_from_commercial_KPI=true', 'cleanup_supported=true'],
    consequence_ru: 'Нет последствий — приёмочная проба, без отправок.',
    reversible: true, test_only: true,
  });
  out.push({ kind: 'decision', ok: d.ok, decisionId: d.decisionId, code: d.code });
  // --- 1 open incident → covers INCIDENT_OPEN; P0 so it surfaces in next-actions critical_incidents
  //     (which filters severity==='P0') → unblocks command-center "Все инциденты" + incident_ack. ---
  const inc = owner.recordIncidentSignal({
    groupKey: `${RUN_ID}_inc_probe`, severity: 'P0', entity_type: 'SERVICE',
    title_ru: `${TAG} Тестовый инцидент`,
    summary_ru: 'TEST_ONLY инцидент для проверки экрана инцидентов. Без отправки.',
    test_only: true, metadata: { ...marker },
  });
  out.push({ kind: 'incident', ok: inc.ok, incidentId: inc.incidentId });

  // --- 1 test_only campaign → covers a DIRECTLY-REACHABLE TEST_ONLY screen (campaigns_screen),
  //     unlike decisions/incidents which are snapshot-gated (see DEF-V3-001). ---
  const camp = campaigns.createCampaign({
    name: `${TAG} Тестовая кампания`, niche: 'acceptance', region: 'TEST',
    cohortSizes: [3], observationHours: 24, testOnly: true,
  });
  out.push({ kind: 'campaign', ok: camp.ok, campaignId: camp.campaignId, code: camp.code });

  console.log('SEED_RESULT ' + JSON.stringify(out));
  console.log('VERIFY ' + JSON.stringify(counts()));
  process.exit(0);
}

console.log('UNKNOWN_MODE ' + mode);
process.exit(2);
