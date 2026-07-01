#!/usr/bin/env node
// tools/analytics_os/tests/completion.test.mjs — functional tests for Analytics OS Completion (Phase 2-26).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, validateGlossary, validateEventTaxonomy, validateContracts, checkCompatibility, metricCatalog, glossary, eventTaxonomy, dataContracts } from '../lib/contracts.mjs';
import { lineageScan, detectCycle } from '../lib/lineage.mjs';
import { runQuality } from '../lib/quality.mjs';
import { reconcile } from '../lib/reconcile.mjs';
import { buildSnapshot, appendSeries, detectMissingPeriods, normalizePeriod, checksum } from '../lib/snapshot.mjs';
import { leadSourceAnalytics, productAnalytics, deliveryAnalytics, financeAnalytics, customerSuccessAnalytics, executiveAnalytics } from '../lib/domain_analytics.mjs';
import { attribute, compareModels } from '../lib/attribution.mjs';
import { validateHypothesis, canTransition, evaluateExperiment, RUNNING_ALLOWED } from '../lib/experiment.mjs';
import { sampleSizeWarning, compareProportions, proportionCI, practicalSignificance } from '../lib/stats.mjs';
import { validateForecast, mape, bias } from '../lib/forecast.mjs';
import { scanExtended, buildRCA } from '../lib/anomaly_ext.mjs';
import { buildInsight } from '../lib/insight.mjs';
import { scanRecord, scanDataset } from '../lib/privacy.mjs';
import { makeReproducible, isReproduction } from '../lib/reproducibility.mjs';
import { classifyChange, crossSystemValidate } from '../lib/schema_version.mjs';
import { governanceScan, validateMetricGovernance } from '../lib/sot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/domain_fixtures.json'), 'utf8'));
const R = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/reconcile.json'), 'utf8'));
const L = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/lineage.json'), 'utf8'));
const SOT = JSON.parse(readFileSync(path.resolve(__dirname, '../data/source_of_truth_extension.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
const eq = (n, a, b) => ok(n, a === b, `expected ${b} got ${a}`);

// --- catalog / glossary / events / contracts ---
eq('catalog valid', validateCatalog().length, 0);
ok('catalog has 9 categories', metricCatalog().categories.length === 9);
ok('catalog covers Product+CS', metricCatalog().metrics.some((m) => m.category === 'PRODUCT') && metricCatalog().metrics.some((m) => m.category === 'CUSTOMER_SUCCESS'));
eq('glossary valid', validateGlossary().length, 0);
ok('glossary distinguishes won/paid/delivered', glossary().terms.find((t) => t.term === 'won').common_confusion.includes('paid'));
eq('event taxonomy valid', validateEventTaxonomy().length, 0);
eq('event taxonomy no emitter', eventTaxonomy().emitter_status, 'NONE_CREATED');
eq('contracts valid', validateContracts().length, 0);
eq('contracts count', dataContracts().contracts.length, 8);
const dc0 = dataContracts().contracts[0];
eq('compat additive', checkCompatibility(dc0, [...dc0.fields, 'x']).change_type, 'ADDITIVE');
eq('compat breaking', checkCompatibility(dc0, dc0.fields.slice(1)).change_type, 'BREAKING');

// --- lineage ---
eq('cycle detected', !!detectCycle([{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]), true);
eq('no cycle', detectCycle(L.edges), null);
ok('lineage flags broken edges', lineageScan({ edges: D.broken_lineage_edges, metrics: [], dashboards: [] }).total > 0);

// --- quality ---
const qr = runQuality([
  { rule_id: 'r1', dataset: 'd', type: 'required', field: 'id', dimension: 'COMPLETENESS', severity: 'HIGH' },
  { rule_id: 'r2', dataset: 'd', type: 'uniqueness', field: 'id', dimension: 'UNIQUENESS', severity: 'CRITICAL' },
], { d: [{ id: 'a' }, { id: 'a' }, {}] });
ok('quality detects failures', qr.failed === 2);
ok('quality exposes failing rules (no masking)', qr.failing_rules.length === 2);
eq('quality counts critical', qr.critical_failures, 1);

// --- reconciliation ---
const rec = reconcile(R);
ok('reconcile finds violations', rec.total >= 6);
eq('reconcile no auto-correction', rec.auto_correction, false);
ok('reconcile flags paid-without-payment', rec.findings.some((f) => f.kind === 'PAID_WITHOUT_PAYMENT_EVIDENCE'));
ok('reconcile flags test-in-commercial', rec.findings.some((f) => f.kind === 'TEST_ONLY_IN_COMMERCIAL_FUNNEL'));
// mini-audit canonical mapping (5 macro / 18 detailed)
const recBad = reconcile({ mini_audit: { macro_phases: 5, detailed_stages: 15 } });
ok('reconcile flags wrong detailed-stage count', recBad.findings.some((f) => f.kind === 'MINI_AUDIT_DETAIL_MISMATCH'));
const recGood = reconcile({ mini_audit: { macro_phases: 5, detailed_stages: 18 } });
ok('reconcile accepts canonical 5/18', !recGood.findings.some((f) => f.kind && f.kind.startsWith('MINI_AUDIT')));

// --- snapshots / historical series ---
const snap = buildSnapshot({ type: 'monthly_finance', dataset: 'fin', rows: [{ a: 1 }], ts: 'T1' });
eq('snapshot synthetic', snap.synthetic, true);
eq('snapshot deterministic checksum', snap.payload_checksum, buildSnapshot({ type: 'monthly_finance', dataset: 'fin', rows: [{ a: 1 }], ts: 'T2' }).payload_checksum);
const s1 = appendSeries({ key: 'k', points: [{ period_label: '2026-05', value: 1 }] }, { period_label: '2026-06', value: 2 });
eq('series append', s1.action, 'APPENDED');
eq('series dup rejected', appendSeries(s1.series, { period_label: '2026-06', value: 9 }).action, 'DUPLICATE_PERIOD_REJECTED');
eq('series correction', appendSeries(s1.series, { period_label: '2026-06', value: 3, correction: true }).action, 'CORRECTION_RECORDED');
ok('missing period detected', detectMissingPeriods(s1.series, ['2026-05', '2026-06', '2026-07']).includes('2026-07'));
eq('period normalized', normalizePeriod('2026/6'), '2026-06');

// --- domain analytics ---
ok('lead source verified rate', leadSourceAnalytics(D.lead_sources)[0].verified_rate === 0.4);
ok('product mismatch detected', productAnalytics(D.products).some((p) => p.product_mismatch === 'ACTIVE_WITHOUT_READINESS'));
ok('delivery qa failure detected', deliveryAnalytics(D.delivery_projects).some((p) => p.qa_failure));
ok('finance forecast error', financeAnalytics(D.finance_period).forecast_error != null);
const cs = customerSuccessAnalytics(D.customers);
ok('cs churn counted', cs.churn_count === 1);
ok('cs health distribution', cs.health_distribution.AT_RISK === 2);
ok('exec overload detected', executiveAnalytics(D.executive).project_overload === 'OVERLOAD');

// --- attribution ---
eq('attribution linear sums to 1', attribute([{ channel: 'a' }, { channel: 'b' }], 'linear').total_weight, 1);
ok('attribution incomplete -> limitation', attribute([{ channel: 'a' }, {}]).limitation === 'INCOMPLETE_TOUCHPOINTS');
ok('attribution carries causation disclaimer', attribute([{ channel: 'a' }]).causation_disclaimer === true);
eq('attribution compare models', compareModels([{ channel: 'a' }, { channel: 'b' }]).length, 4);

// --- experiment governance ---
eq('RUNNING not allowed', RUNNING_ALLOWED, false);
ok('transition to RUNNING blocked', canTransition('APPROVED', 'RUNNING').allowed === false);
ok('empty hypothesis blocked', validateHypothesis({}).length > 0);
ok('experiment never starts', evaluateExperiment({ experiment_id: 'X', status: 'APPROVED', hypothesis: {} }).will_start === false);

// --- statistics ---
eq('small sample critical', sampleSizeWarning(12).level, 'CRITICAL');
ok('overlapping CIs inconclusive', compareProportions(3, 12, 5, 11).inconclusive === true);
ok('proportion CI bounded', proportionCI(5, 100).ci[0] >= 0);
ok('practical significance', practicalSignificance(0.01, 0.05).practically_significant === false);

// --- forecast ---
const fv = validateForecast({ forecast: [10000, 12000, 15000], actual: [6000, 6500, 7000], marked_confirmed: true });
ok('forecast optimistic bias flagged', fv.issues.some((i) => i.kind === 'OPTIMISTIC_BIAS'));
ok('forecast confirmed flagged', fv.issues.some((i) => i.kind === 'FORECAST_MARKED_CONFIRMED'));
ok('mape skips zero actual', mape([1, 2], [0, 2]).n === 1);

// --- anomaly ext + RCA ---
const ax = scanExtended({ funnel_stages: [{ name: 'a', count: 10 }, { name: 'b', count: 20 }], durations: [{ ref: 'p', value: -1 }] });
ok('conversion>100 flagged', ax.anomalies.some((a) => a.kind === 'CONVERSION_OVER_100'));
ok('negative duration flagged', ax.anomalies.some((a) => a.kind === 'NEGATIVE_DURATION'));
eq('RCA never auto-confirms', buildRCA({ kind: 'DROP' }).root_cause_confirmed, false);

// --- insight safety ---
ok('single-point insight blocked', buildInsight({ insight_id: 'i', source_metrics: ['m'], data_points: 1, evidence: ['e'], confidence: 'LOW' }).blocks.some((b) => b.includes('single data point')));
ok('causation-from-correlation blocked', buildInsight({ insight_id: 'i', source_metrics: ['m'], data_points: 3, evidence: ['e'], confidence: 'LOW', claims_causation: true }).blocks.some((b) => b.includes('causation')));
ok('valid insight requires owner review', buildInsight({ insight_id: 'i', source_metrics: ['m'], data_points: 3, evidence: ['e'], confidence: 'MEDIUM' }).insight.owner_review_required === true);

// --- privacy ---
ok('privacy flags secret', scanRecord(D.privacy_violation_example).some((v) => v.kind === 'SECRET'));
ok('privacy flags raw email', scanRecord(D.privacy_violation_example).some((v) => v.kind === 'RAW_EMAIL'));
ok('privacy clean on synthetic ids', scanDataset([{ customer_ref_id: 'TEST_cs01', adoption: 90 }]).ok);

// --- reproducibility ---
const ra = makeReproducible({ x: 1 }, { ts: 'T1' }), rb = makeReproducible({ x: 1 }, { ts: 'T2' });
ok('reproducible across timestamps', isReproduction(ra, rb));
eq('synthetic marker', ra.synthetic_marker, 'SYNTHETIC');

// --- schema versioning + cross-system ---
ok('breaking change needs major', classifyChange(['a', 'b'], ['a'], '1.0', '1.1').version_ok === false);
const cv = crossSystemValidate({ Revenue_OS: { fields: ['deal_id'], statuses: ['WON'] } }, [{ system: 'Revenue_OS', required_fields: ['deal_id'], required_statuses: ['WON'] }, { system: 'Missing_OS', required_fields: ['x'] }]);
ok('cross-system flags missing system', cv.issues.some((i) => i.kind === 'SYSTEM_MISSING'));

// --- SoT governance ---
ok('SoT extension valid', governanceScan({ sotExtension: SOT }).ok);
ok('metric without source blocked', validateMetricGovernance({ metric_id: 'x' }).length > 0);
ok('target-as-actual blocked', governanceScan({ observations: [{ metric_id: 'x', lineage_ref: 'l', confidence: 'OWNER_TARGET', role: 'actual' }] }).error_count > 0);
ok('forecast-as-confirmed blocked', governanceScan({ observations: [{ metric_id: 'x', lineage_ref: 'l', confidence: 'CONFIRMED', is_forecast: true }] }).error_count > 0);

console.log(`\ncompletion.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
