#!/usr/bin/env node
// tools/analytics_os/analytics_ext.mjs
// Analytics OS COMPLETION CLI (Phase 28). Read-only, offline, deterministic.
// Adds catalog/datasets/lineage/quality/reconcile/snapshot/product/customer/attribution/
// experiment/anomalies/insights/measurement-plan/validate-all. No production access, no live reads.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, FIXTURE_DIR, DATA_DIR, arg, nowStamp } from './lib/common.mjs';
import { metricCatalog, glossary, eventTaxonomy, dataContracts, validateCatalog, validateGlossary, validateEventTaxonomy, validateContracts, checkCompatibility } from './lib/contracts.mjs';
import { lineageScan } from './lib/lineage.mjs';
import { runQuality } from './lib/quality.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { buildSnapshot } from './lib/snapshot.mjs';
import { funnelView } from './lib/funnel.mjs';
import { cohortSummary } from './lib/cohort.mjs';
import { leadSourceAnalytics, productAnalytics, deliveryAnalytics, financeAnalytics, customerSuccessAnalytics, executiveAnalytics } from './lib/domain_analytics.mjs';
import { attribute, compareModels } from './lib/attribution.mjs';
import { evaluateExperiment } from './lib/experiment.mjs';
import { scanExtended } from './lib/anomaly_ext.mjs';
import { buildInsight } from './lib/insight.mjs';
import { governanceScan } from './lib/sot.mjs';

const cmd = process.argv[2];
const sub = process.argv[3];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }
function dfx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'domain_fixtures.json'), 'utf8')); }
function rfx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'reconcile.json'), 'utf8')); }
function lfx() { return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'lineage.json'), 'utf8')); }
function sotDoc() { return JSON.parse(readFileSync(path.join(DATA_DIR, 'source_of_truth_extension.json'), 'utf8')); }

function main() {
  switch (cmd) {
    case 'catalog': { const c = metricCatalog(); out('catalog.json', c); console.log(`metrics=${c.metrics.length} categories=${c.categories.length} errors=${validateCatalog(c).length}`); return 0; }
    case 'metrics': { const c = metricCatalog(); c.metrics.forEach((m) => console.log(`  ${m.metric_id} [${m.category}] ${m.source_system} (${m.confidence})`)); return 0; }
    case 'metric': { const m = metricCatalog().metrics.find((x) => x.metric_id === sub); if (!m) { console.error('not found'); return 2; } console.log(JSON.stringify(m, null, 2)); return 0; }
    case 'glossary': { const g = glossary(); out('glossary.json', g); console.log(`terms=${g.terms.length} errors=${validateGlossary(g).length}`); return 0; }
    case 'events': { const e = eventTaxonomy(); console.log(`domains=${Object.keys(e.domains).length} emitter=${e.emitter_status} errors=${validateEventTaxonomy(e).length}`); return 0; }
    case 'datasets': { const d = dataContracts(); out('datasets.json', d); console.log(`contracts=${d.contracts.length} errors=${validateContracts(d).length}`); return 0; }
    case 'lineage': { const l = lfx(); const r = lineageScan({ edges: l.edges, metrics: metricCatalog().metrics, dashboards: l.dashboards }); out('lineage.json', r); console.log(`lineage issues=${r.total} nodes=${r.node_count}`); return 0; }
    case 'quality': {
      const rules = [
        { rule_id: 'q_customer_id', dataset: 'customers', type: 'required', field: 'customer_ref_id', dimension: 'COMPLETENESS', severity: 'HIGH' },
        { rule_id: 'q_health_enum', dataset: 'customers', type: 'enum', field: 'health', allowed: ['HEALTHY', 'AT_RISK', 'CRITICAL', 'UNKNOWN'], dimension: 'VALIDITY', severity: 'MEDIUM' },
      ];
      const d = dfx(); const r = runQuality(rules, { customers: d.customers }); out('quality.json', r); console.log(`quality score=${r.score} failed=${r.failed} critical=${r.critical_failures}`); return 0;
    }
    case 'reconcile': { const r = reconcile(rfx()); out('reconcile.json', r); console.log(`reconcile findings=${r.total} by_severity=${JSON.stringify(r.by_severity)} auto_correct=${r.auto_correction}`); return 0; }
    case 'snapshot': { const id = arg('--fixture', 'domain'); const d = dfx(); const s = buildSnapshot({ type: 'customer_portfolio', dataset: 'cs_portfolio_snapshot', rows: d.customers, ts: TS }); out('snapshot.json', s); console.log(`snapshot ${s.snapshot_id} rows=${s.row_count} checksum=${s.payload_checksum} synthetic=${s.synthetic}`); return 0; }
    case 'funnel': { const f = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'analytics.json'), 'utf8')); const v = funnelView(f.funnel.funnel_ref, f.funnel.stages); out('funnel_ext.json', v); console.log(`funnel overall=${v.overall_conversion}`); return 0; }
    case 'cohort': { const d = dfx(); const c = cohortSummary(d.customer_health_decline_cohorts); out('cohort_ext.json', c); console.log(`cohorts=${c.total_cohorts} blended=${c.blended_retention_rate}`); return 0; }
    case 'sources': { const d = dfx(); const r = leadSourceAnalytics(d.lead_sources); out('lead_sources.json', r); r.forEach((s) => console.log(`  ${s.source}: verified=${s.verified_rate} win=${s.win_rate} health=${s.source_health}`)); return 0; }
    case 'product': { const d = dfx(); const r = productAnalytics(d.products); out('product_analytics.json', r); r.forEach((p) => console.log(`  ${p.product_id}: readiness=${p.readiness_score} mismatch=${p.product_mismatch}`)); return 0; }
    case 'delivery': { const d = dfx(); const r = deliveryAnalytics(d.delivery_projects); out('delivery_analytics.json', r); r.forEach((p) => console.log(`  ${p.project_id}: cycle=${p.cycle_time_days}d qa_fail=${p.qa_failure} rework=${p.rework_count}`)); return 0; }
    case 'finance': { const d = dfx(); const r = financeAnalytics(d.finance_period); out('finance_analytics.json', r); console.log(`margin=${r.margin} cashflow=${r.cashflow} forecast_err=${r.forecast_error}`); return 0; }
    case 'customer': { const d = dfx(); const r = customerSuccessAnalytics(d.customers); out('customer_analytics.json', r); console.log(`adoption=${r.adoption_rate} at_risk=${JSON.stringify(r.health_distribution)} churn=${r.churn_count}`); return 0; }
    case 'attribution': { const tp = [{ channel: 'email' }, { channel: 'followup' }, { channel: 'reply' }]; const r = compareModels(tp); out('attribution.json', r); console.log(`models=${r.length} (causation_disclaimer on all)`); return 0; }
    case 'experiment': { const x = { experiment_id: (sub && !sub.startsWith('--')) ? sub : 'X01', type: 'message', status: 'APPROVED', hypothesis: { population: 'verified leads', variable: 'subject', baseline: 'A', variant: 'B', intervention: 'subject line B', primary_metric: 'reply_rate', metric_definition: 'replies/sent', guardrails: ['bounce<2%'], duration: '2w', sample_requirement: 100, stop_criteria: 'bounce>2%', risk: 'low', owner_approval: true, reason: 'clarity' } }; const r = evaluateExperiment(x); out('experiment.json', r); console.log(`experiment ${r.experiment_id} ready=${r.measurement_ready} running_allowed=${r.running_allowed} will_start=${r.will_start}`); return 0; }
    case 'anomalies': { const d = dfx(); const data = { funnel_stages: [{ name: 'a', count: 10 }, { name: 'b', count: 5 }], durations: [{ ref: 'p2', value: -1 }], support: { current: 6, baseline: 2 } }; const r = scanExtended(data); out('anomalies_ext.json', r); console.log(`anomalies=${r.total} by_severity=${JSON.stringify(r.by_severity)}`); return 0; }
    case 'insights': { const r = buildInsight({ insight_id: 'I01', statement: 'AT_RISK customers cluster in low-adoption cohort', source_metrics: ['cs_adoption_rate', 'cs_health_at_risk'], data_points: 4, evidence: ['cohort decline 4->2'], confidence: 'MEDIUM', action_strength: 'MODERATE', recommended_action: 'owner review onboarding for low-adoption cohort' }); out('insights.json', r); console.log(`insight valid=${r.valid} owner_review=${r.insight.owner_review_required} blocks=${r.blocks.length}`); return 0; }
    case 'measurement-plan': { const p = JSON.parse(readFileSync(path.join(DATA_DIR, 'controlled_commercial_cycle_measurement_plan.json'), 'utf8')); console.log(`measurement plan status=${p.status} cycle_started=${p.execution_state.cycle_started} running_allowed=${p.execution_state.running_allowed}`); return 0; }
    case 'dashboard-refresh': { const f = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'analytics.json'), 'utf8')); out('dashboard_state.json', { generated_ts: TS, synthetic: true, note: 'references existing dashboards; no new dashboard created', kpis: f.kpi_series ? Object.keys(f.kpi_series) : [] }); console.log('dashboard state refreshed (synthetic, references existing dashboards)'); return 0; }
    case 'validate-all': {
      const errs = [];
      errs.push(...validateCatalog().map((e) => `catalog: ${e}`));
      errs.push(...validateGlossary().map((e) => `glossary: ${e}`));
      errs.push(...validateEventTaxonomy().map((e) => `events: ${e}`));
      errs.push(...validateContracts().map((e) => `contracts: ${e}`));
      const gov = governanceScan({ sotExtension: sotDoc() });
      errs.push(...gov.errors.map((e) => `sot: ${e}`));
      const res = { ok: errs.length === 0, error_count: errs.length, errors: errs };
      out('validate_all.json', res); console.log(`validate-all: ${res.ok ? 'OK' : 'FAIL'} errors=${res.error_count}`); return res.ok ? 0 : 1;
    }
    default:
      console.log('Analytics OS completion CLI (read-only). Commands: catalog | metrics | metric <id> | glossary | events | datasets | lineage | quality | reconcile | snapshot --fixture <id> | funnel | cohort | sources | product | delivery | finance | customer | attribution | experiment <id> | anomalies | insights | measurement-plan | dashboard-refresh | validate-all');
      return cmd ? 2 : 0;
  }
}
process.exit(main());
