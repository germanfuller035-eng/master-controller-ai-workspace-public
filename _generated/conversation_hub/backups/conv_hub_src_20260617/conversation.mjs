#!/usr/bin/env node
// tools/conversation_hub/conversation.mjs — Conversation Hub CLI (MP37).
// OFFLINE, deterministic, no network, no production, no send, no live credentials. Clear exit codes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, DATA_DIR, FIXTURE_DIR, arg, nowStamp } from './lib/common.mjs';
import { normalizeMessage, dedupe, correlateThread, resolveIdentity, classify, route, detectOptOut, classifyDelivery } from './lib/engines.mjs';
import { buildDraft, validateDraft, buildApprovalRequest, approvalRevisionConflict, evaluateRetry, summarize, OUTBOUND_HANDOFF, INBOUND_HANDOFF } from './lib/drafts.mjs';
import { validateAll } from './lib/validators.mjs';
import { buildInbox, buildDashboard, buildOwnerCenter } from './lib/inbox.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function load(name) { return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')); }
function fixtures() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'conversation_fixtures.json'), 'utf8')); }
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function findFixture(id) { return fixtures().scenarios.find((s) => s.id === id || s.id.startsWith(id)); }
function dataset() {
  return {
    channels: load('channel_contracts.json'),
    policies: load('policies.json'),
    sot: load('source_of_truth_extension.json'),
    fixtures: fixtures(),
  };
}

function buildBundles() {
  // Derive per-scenario classification/routing bundles for inbox/dashboard.
  const bundles = [];
  for (const s of fixtures().scenarios) {
    if (!s.envelope || s.envelope.direction !== 'INBOUND') {
      if (s.conversation) bundles.push({ conversation: s.conversation, stale: s.stale === true });
      continue;
    }
    const n = normalizeMessage(s.envelope);
    const c = classify(n);
    const id = s.signals ? resolveIdentity(s.signals) : { state: s.envelope.canonical_lead_id ? 'CANONICAL_MATCH' : 'NO_MATCH' };
    const r = route(c, id);
    const conv = s.conversation || { conversation_id: `conv_${s.id}`, status: 'ACTIVE', primary_channel: s.envelope.channel, thread_ids: [], revision: 1, test_only: true, canonical_lead_id: s.envelope.canonical_lead_id || null };
    bundles.push({ conversation: conv, classification: c, routing: r, identity_state: id.state, needs_reply: ['REVENUE_OS', 'CUSTOMER_SUCCESS_OS', 'FINANCE_OS'].includes(r.target_system), stale: s.stale === true });
  }
  return bundles;
}

function main() {
  switch (cmd) {
    case 'inventory': { const i = load('communication_inventory.json'); console.log(`inventory rows=${i.rows.length} canonical_sources=${Object.keys(i.canonical_sources).length} risks=${i.risks_found.length}`); return 0; }
    case 'list': { fixtures().scenarios.forEach((s) => console.log(`  ${s.id}  ${s.title}`)); return 0; }
    case 'show': { const s = findFixture(sub); if (!s) { console.error('not found'); return 2; } console.log(JSON.stringify(s, null, 2)); return 0; }
    case 'normalize': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.envelope) { console.error('not found / no envelope'); return 2; } const n = normalizeMessage(s.envelope); out(`normalize_${s.id}.json`, n); console.log(`normalized ${s.id} channel=${n.channel} type=${n.message_type} sensitivity=${n.sensitivity} checksum=${n.checksum.slice(0, 20)}`); return 0; }
    case 'dedupe': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s) { console.error('not found'); return 2; } const cand = normalizeMessage(s.envelope || {}); if (s.duplicate_of) Object.assign(cand, s.duplicate_of); const seen = s.duplicate_of ? [{ ...normalizeMessage(s.envelope || {}), ...s.duplicate_of, message_id: 'seen_prior', checksum: cand.checksum }] : []; const r = dedupe(cand, seen); console.log(`dedupe ${s.id} -> ${r.outcome} (${r.reason})`); return 0; }
    case 'correlate': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.envelope) { console.error('not found'); return 2; } const r = correlateThread({ ...s.envelope, body_redacted: s.envelope.body }, ['<sent-001@example.test>'], []); console.log(`correlate ${s.id} -> ${r.thread_match} conf=${r.confidence}`); return 0; }
    case 'resolve-identity': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s) { console.error('not found'); return 2; } const sig = s.signals || { canonical_lead_id: s.envelope?.canonical_lead_id }; const r = resolveIdentity(sig); console.log(`identity ${s.id} -> ${r.state} auto_link=${!!r.auto_link} ${r.blocked ? 'BLOCKED' : ''}`); return 0; }
    case 'classify': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.envelope) { console.error('not found'); return 2; } const c = classify(normalizeMessage(s.envelope)); out(`classify_${s.id}.json`, c); console.log(`classify ${s.id} -> ${c.primary_intent} (conf=${c.confidence}, urgency=${c.urgency}, review=${c.manual_review})`); return 0; }
    case 'route': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.envelope) { console.error('not found'); return 2; } const n = normalizeMessage(s.envelope); const c = classify(n); const idn = s.signals ? resolveIdentity(s.signals) : { state: 'NO_MATCH' }; const r = route(c, idn); console.log(`route ${s.id} -> ${r.target_system} priority=${r.priority} ${r.blocked ? 'BLOCKED' : ''}`); return 0; }
    case 'draft': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.draft_request) { console.error('not found / no draft_request'); return 2; } const d = buildDraft(s.draft_request); const v = validateDraft(d, s.draft_context || {}); out(`draft_${s.id}.json`, { draft: d, validation: v }); console.log(`draft ${s.id} -> ${v.status} send_allowed=${d.send_allowed} errors=${v.errors.length}${v.errors.length ? ' [' + v.errors.join('; ') + ']' : ''}`); return 0; }
    case 'validate-draft': { if (!sub) { console.error('usage: validate-draft <file>'); return 3; } const obj = JSON.parse(readFileSync(sub, 'utf8')); const d = obj.draft || obj; const v = validateDraft(buildDraft(d), obj.context || {}); console.log(`validate-draft -> ${v.status} errors=${v.errors.length}`); return v.ok ? 0 : 1; }
    case 'opt-out': { const id = arg('--fixture', sub); const s = findFixture(id); if (!s || !s.envelope) { console.error('not found'); return 2; } const n = normalizeMessage(s.envelope); const c = classify(n); const oo = detectOptOut(n, c); if (!oo) { console.log(`opt-out ${s.id} -> none detected`); return 0; } console.log(`opt-out ${s.id} -> scope=${oo.scope} priority=${oo.priority} canonical_applied=${oo.canonical_applied} (recommendation only)`); return 0; }
    case 'summarize': { const id = arg('--fixture', sub) || sub; const s = findFixture(id); if (!s) { console.error('not found'); return 2; } const conv = s.conversation || { conversation_id: `conv_${s.id}`, status: 'ACTIVE', revision: 1, canonical_lead_id: s.envelope?.canonical_lead_id }; const msgs = s.envelope ? [(() => { const n = normalizeMessage(s.envelope); n.classification = classify(n); return n; })()] : []; const sum = summarize(conv, msgs); out(`summary_${s.id}.json`, sum); console.log(`summary ${conv.conversation_id} situation=${sum.current_situation} open=${sum.open_question} missing=${sum.missing_data.length}`); return 0; }
    case 'inbox': { const inbox = buildInbox(buildBundles()); out('owner_inbox.json', inbox); Object.entries(inbox.counts).forEach(([k, v]) => { if (v) console.log(`  ${k}: ${v}`); }); console.log(`mutates_canonical=${inbox.mutates_canonical}`); return 0; }
    case 'channel-health': { load('policies.json').channel_health.channels.forEach((c) => console.log(`  ${c.channel_id}: ${c.status} read_only=${c.read_only}`)); return 0; }
    case 'contracts': { const ds = dataset(); console.log(`channels=${ds.channels.channels.length} (all NOT_CONNECTED) outbound_handoff_steps=${OUTBOUND_HANDOFF.path.length} inbound_handoff_steps=${INBOUND_HANDOFF.path.length} integrations=${Object.keys(ds.policies.domain_integrations).length}`); return 0; }
    case 'dashboard-refresh': { const ds = dataset(); const inbox = buildInbox(buildBundles()); const dash = buildDashboard(ds, inbox, TS); const center = buildOwnerCenter(ds, inbox, TS); out('conversation_dashboard.json', dash); out('owner_command_center.json', center); console.log(`dashboard refreshed conversations=${dash.conversations_total} needs_reply=${dash.needs_reply} escalations=${dash.escalations} channels_connected=0`); return 0; }
    case 'validate-all': { const r = validateAll(dataset()); const failed = Object.entries(r.dimensions).filter(([, v]) => v !== 'PASS'); failed.forEach(([k, v]) => console.log(`  ${k}: ${v}`)); console.log(`validate-all: ${r.blockers === 0 ? 'OK' : 'BLOCKED'} blockers=${r.blockers} dimensions=${Object.keys(r.dimensions).length}`); return r.blockers === 0 ? 0 : 1; }
    default:
      console.error('Conversation Hub CLI. Commands: inventory|list|show <id>|normalize|dedupe|correlate|resolve-identity|classify|route|draft|validate-draft <file>|opt-out|summarize <id>|inbox|channel-health|contracts|dashboard-refresh|validate-all');
      console.error('  fixture commands take --fixture <id> (or positional id). Offline, no send, no network.');
      return 3;
  }
}
process.exit(main());
