#!/usr/bin/env node
// tools/growth_os/growth.mjs — Growth & Marketing OS CLI (MP33). Read-only, offline, deterministic.
// No production API, no send, no publication, no tracking. Clear exit codes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, DATA_DIR, SOURCES, arg, nowStamp } from './lib/common.mjs';
import { readinessMap, validateCampaign } from './lib/validators.mjs';
import { evaluateReadiness, computeEconomics } from './lib/readiness.mjs';
import { runQA } from './lib/qa.mjs';
import { buildDashboard, buildOwnerCenter } from './lib/dashboard.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function load(name) { return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')); }
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function rmap() { return readinessMap(JSON.parse(readFileSync(SOURCES.revenue_catalog, 'utf8'))); }

function main() {
  switch (cmd) {
    case 'inventory': { const i = JSON.parse(readFileSync(path.join(GENERATED_ROOT, 'reports/GROWTH_INVENTORY.json'), 'utf8')); console.log(`inventory rows=${i.rows.length} canonical_sources=${Object.keys(i.canonical_sources).length}`); return 0; }
    case 'segments': { const s = load('segments.json').segments; s.forEach((x) => console.log(`  ${x.segment_id} [${x.status}] fit=${x.product_fit.join(',')}`)); return 0; }
    case 'segment': { const s = load('segments.json').segments.find((x) => x.segment_id === sub); if (!s) { console.error('not found'); return 2; } console.log(JSON.stringify(s, null, 2)); return 0; }
    case 'icps': { const r = rmap(); load('icp_catalog.json').icps.forEach((i) => console.log(`  ${i.icp_id} product=${i.product_id} ready_to_market=${i.READY_TO_MARKET} (rev=${r[i.product_id]?.state})`)); return 0; }
    case 'icp': { const i = load('icp_catalog.json').icps.find((x) => x.icp_id === sub); if (!i) { console.error('not found'); return 2; } console.log(JSON.stringify(i, null, 2)); return 0; }
    case 'positioning': { const p = load('positioning.json').positionings.find((x) => x.product_id === sub); if (!p) { console.error('not found (pass product_id)'); return 2; } console.log(JSON.stringify(p, null, 2)); return 0; }
    case 'channels': { load('channels.json').channels.forEach((c) => console.log(`  ${c.channel_id} [${c.channel_type}] readiness=${c.readiness}`)); return 0; }
    case 'content-plan': { const c = load('content_plan.json'); out('content_plan.json', c); console.log(`pillars=${c.pillars.length} items=${c.calendar.length} (no publication)`); return 0; }
    case 'seo-plan': { const s = load('seo_plan.json'); out('seo_plan.json', s); console.log(`clusters=${s.clusters.length} volumes=EXTERNAL_DATA_REQUIRED future_contracts=${s.future_contracts.length}`); return 0; }
    case 'landing': { const l = load('landings.json').landings.find((x) => x.product_id === sub || x.landing_id === sub); if (!l) { console.error('not found'); return 2; } out(`landing_${l.product_id}.md`, renderLanding(l)); console.log(`landing ${l.landing_id} readiness=${l.readiness} published=${l.published} tracking=${l.tracking}`); return 0; }
    case 'lead-magnets': { load('lead_magnets.json').lead_magnets.forEach((m) => console.log(`  ${m.lead_magnet_id} product=${m.product_id} published=${m.published}`)); return 0; }
    case 'campaigns': { load('campaigns.json').campaigns.forEach((c) => console.log(`  ${c.campaign_id} status=${c.status} test_only=${c.test_only}${c.blocked_reason ? ' BLOCKED:' + c.blocked_reason : ''}`)); return 0; }
    case 'campaign': { const c = load('campaigns.json').campaigns.find((x) => x.campaign_id === sub); if (!c) { console.error('not found'); return 2; } console.log(JSON.stringify(c, null, 2)); return 0; }
    case 'campaign-readiness': {
      const c = load('campaigns.json').campaigns.find((x) => x.campaign_id === sub); if (!c) { console.error('not found'); return 2; }
      const r = rmap();
      const ctx = { product_ready: (c.product_ids || []).every((p) => r[p]?.marketable), segment_defined: !!(c.segment_ids || []).length, icp_defined: true, claim_approved: true, assets_valid: true, price_approved: (c.product_ids || []).every((p) => r[p]?.approved), delivery_capacity_confirmed: c.capacity?.delivery === 'low', support_capacity_confirmed: c.capacity?.support === 'low', owner_capacity_confirmed: false, metrics_defined: !!(c.metrics || []).length, stop_criteria_defined: !!(c.stop_gate || c.stop_criteria), opt_out_policy_defined: true, approval_flow_defined: !!c.approval_state };
      const res = evaluateReadiness(c, ctx); out(`campaign_readiness_${c.campaign_id}.json`, res);
      console.log(`${c.campaign_id} ready=${res.ready} permitted=${res.permitted_status} active_allowed=${res.active_allowed} failed=${res.failed_conditions.join(',') || 'none'}`); return 0;
    }
    case 'economics': {
      const c = load('campaigns.json').campaigns.find((x) => x.campaign_id === sub); if (!c) { console.error('not found'); return 2; }
      const e = computeEconomics({ economics_id: `econ_${c.campaign_id}`, budget: c.budget?.tooling || 0, owner_hours: c.budget?.owner_hours || 0, owner_hour_value: 2000, candidates: 50, verified: 20, replies: 5, wins: 1, deal_value: 10000, gross_margin_rate: 0.7, capacity_ceiling: 5, source_status: 'MODEL_ESTIMATE' });
      out(`economics_${c.campaign_id}.json`, e); console.log(`${c.campaign_id} cost_per_win=${e.cost_per_win} break_even_wins=${e.break_even_wins} viable=${e.viable} (${e.confidence})`); return 0;
    }
    case 'experiments': { const x = load('experiment_backlog.json').experiments; out('experiments.json', x); console.log(`experiments=${x.length} ready=${x.filter((e) => e.status === 'READY').length} running=${x.filter((e) => e.status === 'RUNNING').length}`); return 0; }
    case 'controlled-cycle': { const r = load('controlled_cycle_runbook.json'); console.log(`controlled cycle status=${r.status} started=${r.execution_state.cycle_started} running_allowed=${r.execution_state.running_allowed}`); return 0; }
    case 'partnerships': { load('partner_referral_social.json').partner_programs.forEach((p) => console.log(`  ${p.partner_program_id} [${p.partner_type}] ${p.status}`)); return 0; }
    case 'referrals': { const r = load('partner_referral_social.json').referral_policy; console.log(`referral auto_request=${r.auto_request} status=${r.status}`); return 0; }
    case 'social-proof': { load('partner_referral_social.json').social_proof.forEach((s) => console.log(`  ${s.proof_id} [${s.type}] ${s.status} published=${s.published}`)); return 0; }
    case 'dashboard-refresh': { const d = buildDashboard(TS); out('growth_dashboard.json', d); const o = buildOwnerCenter(TS); out('owner_growth_command_center.json', o); console.log(`dashboard refreshed (campaigns ready=${d.campaign_readiness.ready} active=${d.campaign_readiness.active} qa_ok=${d.qa.ok})`); return 0; }
    case 'validate-all': { const r = runQA(); out('qa_report.json', r); console.log(`validate-all: ${r.ok ? 'OK' : 'FAIL'} blockers=${r.total_blockers} dimensions=${r.dimensions_checked}`); return r.ok ? 0 : 1; }
    default:
      console.log('Growth OS CLI (read-only). Commands: inventory | segments | segment <id> | icps | icp <id> | positioning <product> | channels | content-plan | seo-plan | landing <product> | lead-magnets | campaigns | campaign <id> | campaign-readiness <id> | economics <id> | experiments | controlled-cycle | partnerships | referrals | social-proof | dashboard-refresh | validate-all');
      return cmd ? 2 : 0;
  }
}

function renderLanding(l) {
  return `# ${l.product_id} — landing preview (DRAFT, NOT PUBLISHED)\n\n- audience: ${l.audience}\n- problem: ${l.problem}\n- outcome: ${l.outcome}\n- scope: ${(l.scope || []).join(', ')}\n- exclusions: ${(l.exclusions || []).join(', ')}\n- price: ${l.price_status}\n- CTA: ${l.cta}\n- privacy: ${l.privacy_note}\n- readiness: ${l.readiness}\n\n> published=${l.published} · tracking=${l.tracking} · form_connected=${l.form_connected}\n`;
}

process.exit(main());
