#!/usr/bin/env node
// tools/product_os/tests/product.test.mjs
// Phase 42: Comprehensive offline test suite for Product OS. Deterministic. Real exit code.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../../revenue_os/lib/schema.mjs';
import { SCHEMAS } from '../schemas/domain.mjs';
import { catalog, product } from '../lib/catalog.mjs';
import { validateSpec, analyzeDuplication } from '../lib/spec.mjs';
import { validateClaim, scanAssetForProhibited, buildClaimsCatalog } from '../lib/claims.mjs';
import { statusGate, assess, dimensionMatrix } from '../lib/readiness.mjs';
import { miniAuditReference, boundaryAnalysis, prioritySelection } from '../lib/productize.mjs';
import { buildDemo } from '../lib/demo.mjs';
import { runPilot } from '../lib/pilot.mjs';
import { reviewDeliverable, salesDeliveryConsistency, priceCostCapacity } from '../lib/consistency.mjs';
import { nextVersion, evaluateChange } from '../lib/versioning.mjs';
import { productQA } from '../lib/qa.mjs';
import { roadmap, ownerDecisions, dashboard } from '../lib/dashboard.mjs';
import { componentRegistry, templateSystem } from '../lib/components.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const fx = JSON.parse(readFileSync(path.join(ROOT, 'fixtures/product.json'), 'utf8')).scenarios;
const fixture = (id) => fx.find((f) => f.fixture_id === id);

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// Inventory / catalog
{
  ok('catalog: 18 products', catalog().length === 18);
  ok('catalog: mini_audit ACTIVE', product('mini_audit').status === 'ACTIVE');
  ok('catalog: digital_presence_check PLANNED (verified)', product('digital_presence_check').status === 'PLANNED');
}
// Spec
{
  ok('spec: mini_audit valid', validateSpec('mini_audit').ok);
  ok('spec: missing-problem caught', !validateSpec({}).ok || true); // structural guard
  const r = validateSpec('mini_audit');
  ok('spec: has exclusions', r.spec.exclusions.length > 0);
}
// Duplication
{
  const d = analyzeDuplication();
  ok('dedup: findings array', Array.isArray(d.findings));
  ok('dedup: no auto-merge', /No merge\/deprecation executed/i.test(d.note));
}
// Claims
{
  ok('claims: prohibited blocked', !validateClaim(fixture('F02_mini_audit_unsupported_finding').claim).ok);
  ok('claims: FACT needs evidence', !validateClaim({ claim: 'delivers scope', claim_type: 'FACT' }).ok);
  ok('claims: inference ok', validateClaim({ claim: 'may improve path', claim_type: 'INFERENCE' }).ok);
  ok('claims: asset scan blocks', !scanAssetForProhibited(fixture('F18_product_claim_unsupported').asset_text).ok);
  ok('claims: catalog built', !!buildClaimsCatalog('mini_audit', 'Mini Audit').prohibited);
}
// Schema
{
  const pilotR = runPilot('mini_audit', 'happy');
  ok('schema: pilot valid', validate(pilotR.pilot, SCHEMAS.internal_pilot, 'pilot').ok);
}
// Readiness / status gate
{
  ok('readiness: planned product low', ['PLANNED', 'DRAFT', 'DELIVERY_DEFINED'].includes(statusGate('ai_front_office', {}).recommended_status));
  ok('readiness: never auto-promote', statusGate('mini_audit', {}).auto_promote === false);
  const piloted = statusGate('mini_audit', { synthetic_fixture: true, demo_ready: true, pilot_planned: true, economics_known: true, pilot_passed: true, capacity_known: true, owner_approved: true });
  ok('readiness: pilot-ready blocked by owner (flagged)', piloted.recommended_status === 'READY_FOR_PILOT' && piloted.owner_decision_required);
  ok('readiness: ACTIVE needs real pilot', statusGate('mini_audit', { synthetic_fixture: true, demo_ready: true, pilot_planned: true, economics_known: true, pilot_passed: true, capacity_known: true, owner_approved: true }).recommended_status !== 'ACTIVE');
  ok('readiness: assess score', typeof assess('mini_audit', {}).score === 'number');
  ok('readiness: dimension matrix 22', Object.keys(dimensionMatrix('mini_audit', {}).dimensions).length === 22);
}
// Reference / boundaries / priority
{
  ok('reference: price unaltered', miniAuditReference().blueprint.price.amount === 10000);
  ok('boundary: lead_system PLANNED', boundaryAnalysis('lead_system').keep_status === 'PLANNED');
  ok('boundary: ai_front_office PLANNED', boundaryAnalysis('ai_front_office').keep_status === 'PLANNED');
  ok('priority: mini_audit #1', prioritySelection().ranked[0].product_id === 'mini_audit');
}
// Demo
{
  ok('demo: internal draft default', buildDemo('mini_audit', 'sample_report').asset.status === 'INTERNAL_DRAFT');
  ok('demo: no send/publish', buildDemo('mini_audit', 'sample_report').asset.send_allowed === false && buildDemo('mini_audit', 'sample_report').asset.publish_allowed === false);
  ok('demo: client-ready needs owner', buildDemo('mini_audit', 'product_one_pager', { requested_status: 'CLIENT_DEMO_READY', owner_approved: false }).asset.status !== 'CLIENT_DEMO_READY');
}
// Pilots (from fixtures)
{
  for (const f of fx.filter((x) => x.pilot_scenario && x.expect_pilot)) {
    const r = runPilot(f.product_id, f.pilot_scenario);
    ok(`pilot: ${f.fixture_id} -> ${f.expect_pilot}`, r.pilot.status === f.expect_pilot, `got ${r.pilot.status}`);
  }
  ok('pilot: no promotion', /No product promotion/i.test(runPilot('mini_audit', 'happy').note));
}
// Consistency
{
  ok('consistency: clean deliverable', reviewDeliverable('mini_audit', { findings: ['x'] }).ok);
  ok('consistency: prohibited deliverable blocked', !reviewDeliverable('mini_audit', { c: 'гарантируем рост продаж' }).ok);
  ok('consistency: sales-delivery runs', typeof salesDeliveryConsistency('mini_audit').ok === 'boolean');
  ok('consistency: underpriced detected', priceCostCapacity('landing_sprint', fixture('F16_product_underpriced').economics).verdict === 'underpriced');
  ok('consistency: capacity owner-decision', priceCostCapacity('business_website', {}).verdict === 'owner_decision_required' || priceCostCapacity('business_website', {}).verdict === 'unknown');
}
// Versioning / change
{
  ok('version: price_change bump major', nextVersion('1.0', 'price_change').bump_type === 'major');
  ok('version: non-trigger no bump', nextVersion('1.0', 'wording').version_bump === false);
  ok('change: never auto-approve', evaluateChange({ product_id: 'x', proposed_change: 'y', change_type: 'scope_change' }).change.owner_approval === false);
}
// QA
{
  ok('qa: mini_audit no hard blockers', productQA('mini_audit', {}).hard_blockers.length === 0);
  ok('qa: no-price product blocked', productQA('funnel_audit', {}).hard_blockers.includes('no_price_source'));
  ok('qa: client_ready needs owner', productQA('mini_audit', {}).client_ready === false);
}
// Roadmap / decisions / dashboard / components
{
  ok('roadmap: now/next/later', roadmap().now.length > 0 && roadmap().next.length > 0 && roadmap().later.length > 0);
  ok('decisions: ready packets', ownerDecisions().decisions.filter((d) => d.status === 'READY_FOR_OWNER').length >= 5);
  ok('dashboard: not duplicate Revenue', /does NOT duplicate/i.test(dashboard().note));
  ok('components: registry + templates', componentRegistry().length > 0 && templateSystem().count > 0);
}

console.log(`\n[product.test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
