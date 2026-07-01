#!/usr/bin/env node
// tools/analytics_os/gen_proposed_docs.mjs — generates proposed canonical docs (Phase 27). Read-only.
// Writes ONLY under docs_canonical_proposed/. Does NOT apply anything. Owner applies post-review.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'docs_canonical_proposed');
const SUB = '11_analytics_os';

// [filename, title, canonical_target, body]
const DOCS = [
  ['analytics_os_command_center.md', 'Analytics OS — Canonical Note', '07_revenue_os/analytics_os_command_center.md',
    'Analytics OS is a derived, read-only metrics/reporting layer over the full OS chain (AI HQ, Revenue, Delivery, Finance, Executive, Product, Customer Success). It owns metric definitions and derived observations only; it never writes canonical domain data, sends, installs tracking, runs experiments, or mutates production. All current data is synthetic.'],
  ['metric_catalog.md', 'Metric Catalog', '11_analytics_os/metric_catalog.md',
    'Single catalog of analytics metrics across 9 categories (Master Controller, Revenue, Delivery, Finance, Product, Customer Success, Executive, AI HQ, System Health). Each metric references its source-of-record formula; Analytics OS does not redefine domain formulas. Source: tools/analytics_os/data/metric_catalog.json.'],
  ['business_glossary.md', 'Business Glossary', '11_analytics_os/business_glossary.md',
    'Canonical term definitions (lead, verified, qualified, sent, delivered, reply, won, accepted, customer, adoption, revenue, invoice, payment, profit, readiness, target, forecast, experiment). Each names owner system, included/excluded scope, and the common confusion it resolves. Source: business_glossary.json.'],
  ['event_taxonomy.md', 'Event Taxonomy', '11_analytics_os/event_taxonomy.md',
    'Versioned event contracts across lead/revenue/delivery/finance/product/customer-success domains. Contracts only — no emitter is created. Source: event_taxonomy.json.'],
  ['data_contract_standard.md', 'Data Contract Standard', '11_analytics_os/data_contract_standard.md',
    'Producer→consumer dataset contracts with schema_version, fields, status semantics, freshness, quality rules, sensitivity, retention, and breaking-change policy. Compatibility validator: additive = backward-compatible, removed/renamed = breaking.'],
  ['data_quality_policy.md', 'Data Quality Policy', '11_analytics_os/data_quality_policy.md',
    '10 quality dimensions, 10 rule types, 5 severities. Quality score never masks individual rule failures — both score and failing rules are reported.'],
  ['data_lineage_policy.md', 'Data Lineage Policy', '11_analytics_os/data_lineage_policy.md',
    'Every metric must trace to a source via lineage edges with code references. Detectors flag metric-without-lineage, dashboard-without-metric, transform-without-code-ref, circular lineage, stale source, hidden manual override.'],
  ['snapshot_policy.md', 'Snapshot Policy', '11_analytics_os/snapshot_policy.md',
    'Immutable local snapshots with deterministic checksums + source versions. Historical series are append-only with duplicate-period rejection, correction records, and missing-period detection. Synthetic only.'],
  ['funnel_measurement_standard.md', 'Funnel Measurement Standard', '11_analytics_os/funnel_measurement_standard.md',
    'Funnel conversion is a derived VIEW over an existing Revenue OS funnel (funnel_ref). Analytics OS never defines a new funnel. Conversion >100% between stages is an anomaly.'],
  ['cohort_standard.md', 'Cohort Standard', '11_analytics_os/cohort_standard.md',
    'Cohort retention curves + blended retention over synthetic groupings. Used for customer health-decline cohorts and revenue cohorts.'],
  ['attribution_policy.md', 'Attribution Policy', '11_analytics_os/attribution_policy.md',
    'Transparent attribution (first/last/linear/position-based). Attribution is correlation, NOT causation. Incomplete touchpoints produce a stated limitation, never a forced allocation.'],
  ['experiment_policy.md', 'Experiment Policy', '11_analytics_os/experiment_policy.md',
    'Experiment governance lifecycle. RUNNING_ALLOWED=NO during freeze — no experiment starts. Transitions into RUNNING are blocked. Hypothesis + guardrails + owner approval required before readiness.'],
  ['statistical_guardrails.md', 'Statistical Guardrails', '11_analytics_os/statistical_guardrails.md',
    'Offline helpers: sample-size + small-sample warnings, confidence intervals, proportion/mean comparison, outlier + multiple-comparison warnings, practical significance, inconclusive verdicts. Weak evidence is never conclusive; causation is never auto-asserted.'],
  ['forecast_validation.md', 'Forecast Validation', '11_analytics_os/forecast_validation.md',
    'MAE, MAPE (valid pairs only), bias, interval coverage. Detects target-copied-as-forecast, optimistic bias, impossible capacity, missing actuals, forecast-marked-confirmed.'],
  ['anomaly_rca_policy.md', 'Anomaly / RCA Policy', '11_analytics_os/anomaly_rca_policy.md',
    'Extended anomaly kinds + RCA helper. Root cause is never asserted without supporting evidence; candidate causes require owner validation.'],
  ['insight_policy.md', 'Insight Policy', '11_analytics_os/insight_policy.md',
    'Insights carry source_metrics, evidence, confidence, limitations, recommended_action, owner_review_required. Blocks single-point insight, correlation-as-causation, action exceeding evidence, and production mutation during freeze.'],
  ['privacy_minimization.md', 'Privacy / Minimization', '11_analytics_os/privacy_minimization.md',
    'No secrets, raw passwords, private keys, unnecessary email/phone, or full message bodies. Stable IDs, aggregate where possible, redact free text, synthetic fixtures, references over copies.'],
  ['retention.md', 'Retention Policy', '11_analytics_os/retention.md',
    'Retention windows for fixtures/snapshots/reports/experiments/anomalies/corrections. No automatic deletion — deletion requires owner approval.'],
  ['report_reproducibility.md', 'Report Reproducibility', '11_analytics_os/report_reproducibility.md',
    'Every report carries version, source snapshots/commits, formulas, filters, exclusions, confidence, synthetic marker, and a deterministic content hash (excluding timestamp). Existing reports are upgraded, not duplicated.'],
  ['controlled_commercial_cycle_measurement_plan.md', 'Controlled Commercial Cycle Measurement Plan', '11_analytics_os/controlled_commercial_cycle_measurement_plan.md',
    'FUTURE plan only. Defines eligibility, exclusions, daily limit, approval rule, send/delivery evidence, reply classification, opt-out, funnel stages, capacity tracking, stop criteria, safety guardrails. Not executed; requires owner approval + freeze lift.'],
  ['analytics_dashboard.md', 'Analytics Dashboard', '09_dashboards/analytics_dashboard.md',
    'References existing dashboards; presents derived KPI/trend/funnel/cohort/quality views. Creates no new dashboard runtime. Synthetic data.'],
  ['owner_analytics_command_center.md', 'Owner Analytics Command Center', '09_dashboards/owner_analytics_command_center.md',
    'Owner-facing read-only analytics summary: KPIs, anomalies, reconciliation findings, decision backlog. Links to domain dashboards; no duplication.'],
  ['integration_contracts.md', 'Integration Contracts', '11_analytics_os/integration_contracts.md',
    '8 producer→consumer snapshot contracts (MC, Revenue, Delivery, Finance, Product, Customer Success, Executive, AI HQ). Analytics OS is consumer only.'],
  ['source_of_truth_extension.md', 'Source of Truth Extension', '11_analytics_os/source_of_truth_extension.md',
    'Extends Executive OS SoT matrix. Analytics OS owns metric_definition + derived_observation only. Validator blocks dual writers, metric-without-source, target-as-actual, forecast-as-confirmed, lineage-less observation, and domain mutation.'],
  ['what_already_exists_links.md', 'WHAT_ALREADY_EXISTS + AI System Map Links', '11_analytics_os/what_already_exists_links.md',
    'Analytics Reporting v1 (imported): CLI, rollup, trends, funnel, cohort, anomaly, reports, validators, domain schema, 47 tests. Completion v1 adds: catalog, glossary, events, contracts, lineage, quality, reconciliation, snapshots, domain analytics, Product/CS integration, attribution, experiments, stats, forecast, RCA, insight, privacy, retention, reproducibility, data catalog, schema versioning, cross-system validation. Links: tools/analytics_os/, _generated/analytics_os/.'],
];

mkdirSync(path.join(ROOT, SUB), { recursive: true });
mkdirSync(path.join(ROOT, '07_revenue_os'), { recursive: true });
mkdirSync(path.join(ROOT, '09_dashboards'), { recursive: true });

let count = 0;
for (const [file, title, target, body] of DOCS) {
  const dir = target.includes('/') ? path.dirname(target) : SUB;
  mkdirSync(path.join(ROOT, dir), { recursive: true });
  const md = `---\ncanonical_target: ${target}\nrelated_project: analytics-os\nstatus: PROPOSED_NOT_APPLIED\nsynthetic: true\n---\n\n# ${title}\n\n${body}\n\n> Proposed canonical doc. NOT applied. Owner applies post-review via AI HQ apply flow.\n`;
  writeFileSync(path.join(ROOT, dir, file), md);
  count++;
}
console.log(`[gen-proposed-docs] wrote ${count} proposed docs under docs_canonical_proposed/`);
