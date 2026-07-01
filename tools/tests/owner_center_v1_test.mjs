/**
 * owner_center_v1_test.mjs — Owner Command & Autonomy Center backend scenario lab.
 *
 * OFFLINE. No network. No SMTP. No send. Operates on a TEMP owner-center store
 * (MATER_OWNER_CENTER_STORE_PATH). Covers the mandated scenarios that are testable
 * at the backend layer: event bus, dedup, severity routing, incident grouping,
 * auto-remediation allow/forbid, owner decisions (write+reread, revision, idempotency,
 * no false success, no outbound), next-best-action, kill switch, brief, deterministic agent.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = path.join(os.tmpdir(), `mc_owner_center_${process.pid}_${Date.now()}.json`);
process.env.MATER_OWNER_CENTER_STORE_PATH = TMP;

const svc = await import('../mater_controller_api/src/owner_center/service.mjs');
const ops = await import('../mater_controller_api/src/owner_center/chief_ops.mjs');

let passed = 0, failed = 0; const fails = [];
function check(n, c) { if (c) { passed++; console.log('  ✅ ' + n); } else { failed++; fails.push(n); console.log('  ❌ ' + n); } }

console.log('\n=== Owner Command & Autonomy Center — Scenario Lab ===\n');

// 1-2. event publish + APP_INBOX notification
console.log('Scenario: event bus + notification');
const e1 = svc.publishEvent({ event_type: 'POSITIVE_REPLY', severity: 'P1', entity_type: 'CONVERSATION', entity_id: 'c1', title_ru: 'Положительный ответ', summary_ru: 'Клиент заинтересован' });
check('event written', e1.ok && e1.written);
check('notification generated', !!e1.notificationId);
check('P1 routes push', e1.channels.includes('ANDROID_PUSH'));
check('P1 positive_reply routes telegram', e1.channels.includes('TELEGRAM_OWNER'));

// 22. duplicate notification / idempotent event
console.log('Scenario: duplicate event dedup');
const e1dup = svc.publishEvent({ event_type: 'POSITIVE_REPLY', severity: 'P1', entity_type: 'CONVERSATION', entity_id: 'c1', title_ru: 'Положительный ответ', summary_ru: 'дубль' });
check('duplicate is idempotent', e1dup.ok && e1dup.idempotent === true);

// severity routing: P2 stays in-app
console.log('Scenario: P2 severity routing');
const e2 = svc.publishEvent({ event_type: 'CONTACT_NOT_FOUND', severity: 'P2', entity_type: 'LEAD', entity_id: 'L1', title_ru: 'Контакт не найден' });
check('P2 app inbox only', e2.channels.length === 1 && e2.channels[0] === 'APP_INBOX');

// P0 routing
console.log('Scenario: P0 routing (all channels)');
const e0 = svc.publishEvent({ event_type: 'CANONICAL_WRITER_ANOMALY', severity: 'P0', entity_type: 'SERVICE', entity_id: 'writer', title_ru: 'Аномалия canonical writer' });
check('P0 → push + telegram', e0.channels.includes('ANDROID_PUSH') && e0.channels.includes('TELEGRAM_OWNER'));

// 8-9. duplicate error storm → one incident
console.log('Scenario: error storm → single grouped incident');
let incId = null;
for (let i = 0; i < 20; i++) {
    const r = svc.recordIncidentSignal({ groupKey: 'yandex_outage', severity: 'P2', entity_type: 'SOURCE', title_ru: 'Yandex Search недоступен', summary_ru: 'Затронуто задач: ' + (i + 1) });
    incId = r.incidentId;
}
const incs = svc.listIncidents({}).items;
const yandex = incs.find((i) => i.group_key === 'yandex_outage');
check('20 signals → 1 incident', !!yandex && yandex.event_count === 20);
check('incident grouped', svc.listIncidents({}).total >= 1);

// incident recovery
console.log('Scenario: incident auto-recovery → resolved (not deleted)');
svc.transitionIncident({ incidentId: incId, state: 'OBSERVING', automaticAction: 'SWITCH_FREE_FALLBACK_SOURCE' });
const tr = svc.transitionIncident({ incidentId: incId, state: 'RESOLVED' });
check('resolved', tr.ok);
check('P-incident not deleted (still listed w/ activeOnly=false)', svc.listIncidents({ activeOnly: false }).items.some((i) => i.incident_id === incId));

// 10. auto-remediation allowed
console.log('Scenario: auto-remediation allow/forbid');
const remOk = svc.recordRemediation({ playbook: 'RESTART_WORKER', trigger: 'worker_crash', actions: ['systemctl restart'], result: 'recovered', recoveryEvidence: 'health 200' });
check('allowed playbook recorded', remOk.ok && remOk.written);
const remBad = svc.recordRemediation({ playbook: 'SEND_CLIENT', trigger: 'x' });
check('forbidden playbook rejected', !remBad.ok && remBad.code === 'PLAYBOOK_FORBIDDEN');
check('SMTP_UNKNOWN retry forbidden', !svc.isPlaybookAllowed('RETRY_SMTP_UNKNOWN'));
check('enable send live forbidden', !svc.isPlaybookAllowed('ENABLE_SEND_LIVE'));
check('kill switch allowed', svc.isPlaybookAllowed('ENABLE_OUTBOUND_KILL_SWITCH'));

// owner decision: write + reread + revision + idempotency + no outbound
console.log('Scenario: owner decision lifecycle');
const d1 = svc.createDecision({ category: 'CLIENT', priority: 'P1', title_ru: 'Готово первое касание для «Акме»', recommendation: { action: 'approve_text_only' }, allowed_actions: ['APPROVE', 'REJECT', 'DEFER'] });
check('decision created', d1.ok && d1.decisionId);
const dOpen = svc.listDecisions({ status: 'OPEN' }).items.find((x) => x.decision_id === d1.decisionId);
check('performs_outbound is false', dOpen.performs_outbound === false);
const res1 = svc.resolveDecision({ decisionId: d1.decisionId, action: 'APPROVE', expectedDecisionRevision: 0 });
check('resolve ok + no outbound', res1.ok && res1.performsOutbound === false);
const res2 = svc.resolveDecision({ decisionId: d1.decisionId, action: 'APPROVE' });
check('re-resolve idempotent (no false re-apply)', res2.ok && res2.idempotent === true);
const dStop = svc.createDecision({ category: 'CAMPAIGN', priority: 'P1', title_ru: 'Подтвердить когорту 20', allowed_actions: ['APPROVE', 'STOP_PROCESS'] });
const resConf = svc.resolveDecision({ decisionId: dStop.decisionId, action: 'APPROVE', expectedDecisionRevision: 5 });
check('revision conflict detected', !resConf.ok && resConf.code === 'DECISION_REVISION_CONFLICT');
const resBad = svc.resolveDecision({ decisionId: dStop.decisionId, action: 'REQUEST_CHANGES' });
check('action not in allowed_actions rejected', !resBad.ok && resBad.code === 'ACTION_NOT_ALLOWED');

// 23. expired decision / event
console.log('Scenario: expiry');
const past = new Date(Date.now() - 3600000).toISOString();
svc.publishEvent({ event_type: 'OLD', severity: 'P2', entity_type: 'JOB', entity_id: 'j9', title_ru: 'Старое', expires_at: past });
check('expired event hidden from list', !svc.listEvents({}).items.some((e) => e.title_ru === 'Старое'));

// 24. kill switch
console.log('Scenario: kill switch');
const ks = svc.enableKillSwitch({ reason: 'owner_test' });
check('kill switch enabled', ks.ok && svc.getAutopilot().kill_switch.enabled === true);

// autopilot mode
console.log('Scenario: autopilot modes');
check('default MANAGED', svc.DEFAULT_AUTOPILOT === 'MANAGED');
check('set OBSERVE ok', svc.setAutopilotMode({ mode: 'OBSERVE' }).ok);
check('LIMITED_AUTOMATION owner-only blocked', !svc.setAutopilotMode({ mode: 'LIMITED_AUTOMATION' }).ok);

// next best action (deterministic)
console.log('Scenario: next best action');
check('verified+contact → score', svc.leadNextBestAction({ lead_id: 'L', website: 'x', website_status: 'FOUND', email_source: 'website_official_page', status: 'verified_pending_score' }).action_type === 'RUN_SCORE');
check('found site no email → retry crawl', svc.leadNextBestAction({ lead_id: 'L', website: 'x', website_status: 'FOUND', email_status: 'UNCONFIRMED' }).action_type === 'RETRY_CRAWL');
check('first touch pending → owner', svc.leadNextBestAction({ lead_id: 'L', website: 'x', audit_status: 'AUDIT_READY', first_touch: { status: 'APPROVAL_PENDING' } }).owner_action_required === true);
check('opt out → close', svc.leadNextBestAction({ lead_id: 'L', opt_out: true }).action_type === 'CLOSE_LEAD');

// 25-26. deterministic agent mode + brief
console.log('Scenario: chief ops agent + brief (deterministic)');
check('agent deterministic by default', ops.agentMode() === 'DETERMINISTIC_ONLY');
check('10 specialist agents', ops.agentsStatus().specialists.length === 10);
const brief = ops.buildCommandBrief({ funnel: { leads_24h: 5, verified_companies: 3 }, snapshot: { costMonthPct: 20 }, store: JSON.parse(fs.readFileSync(TMP, 'utf8')) });
check('brief has owner_actions <=3', brief.owner_actions.length <= 3);
check('brief outbound off', brief.outbound_ru.includes('no-send'));
const constraint = ops.primaryConstraint({ costMonthPct: 100 }, {});
check('cost 100% → constraint', constraint.kind === 'COST_LIMIT');

// no outbound anywhere
console.log('Scenario: no outbound invariant');
check('SENDS_FROM_OWNER_CENTER false', svc.SENDS_FROM_OWNER_CENTER === false);
const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..', 'mater_controller_api', 'src', 'owner_center', 'service.mjs'), 'utf8');
check('no nodemailer/smtp import in service', !/nodemailer|createTransport|tls\.connect/i.test(src));

// cleanup
try { for (const f of fs.readdirSync(os.tmpdir())) { if (f.startsWith(path.basename(TMP))) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch {} } } } catch {}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { console.log('FAILURES:', fails.join(', ')); process.exit(1); }
process.exit(0);
