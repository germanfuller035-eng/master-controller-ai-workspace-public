#!/usr/bin/env node
// tools/revenue_os/revenue.mjs
// Phase 26: Revenue OS CLI. Offline, deterministic, no send, no production mutation.
//
// Commands:
//   products | product <id> | recommend --input <fixture-id|file> | validate-product <id>
//   validate-evidence <file> | create-offer --profile <id> --product <id>
//   create-proposal --profile <id> --product <id> [--label X] | create-draft --profile <id> --type T --channel C
//   price-check <product> [--amount N] | scope-check <product> | simulate-funnel <scenario-file>
//   capacity <scenario-file> | dashboard-refresh | validate-all
// Exit: 0 ok, 1 validation findings, 2 not-found, 3 bad invocation.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT, GENERATED_ROOT, arg, hasFlag, nowStamp } from './lib/common.mjs';
import { recommend, loadCatalog } from './lib/recommend.mjs';
import { resolvePrice, economics, priceGuard } from './lib/pricing.mjs';
import { validateScope, buildScope } from './lib/scope.mjs';
import { buildOffer } from './lib/offer.mjs';
import { generateProposal } from './lib/proposal.mjs';
import { buildDraft } from './lib/messaging.mjs';
import { simulate } from './lib/funnel.mjs';
import { plan } from './lib/capacity.mjs';
import { validateCatalog, validateOffer, validateDraft, validateAll } from './lib/validators.mjs';
import { checkClaims } from './lib/evidence.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');

function catalog() { return loadCatalog(); }
function product(id) { return catalog().products.find((p) => p.product_id === id); }
function profile(id) {
  const fx = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'fixtures/customer_profiles.json'), 'utf8'));
  return fx.profiles.find((p) => p.profile_id === id);
}
function out(name, data) {
  mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, name);
  writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return f;
}

function main() {
  switch (cmd) {
    case 'products': {
      for (const p of catalog().products) console.log(`${p.product_id.padEnd(24)} ${p.status.padEnd(16)} ${resolvePrice(p.product_id).display}`);
      return 0;
    }
    case 'product': {
      const p = product(process.argv[3]);
      if (!p) { console.error('not found'); return 2; }
      console.log(JSON.stringify(p, null, 2));
      return 0;
    }
    case 'recommend': {
      const id = arg('--profile') || arg('--input');
      const prof = profile(id);
      if (!prof) { console.error(`profile not found: ${id}`); return 2; }
      const r = recommend(prof);
      const f = out(`recommendation_${id}.json`, r);
      console.log(`primary=${r.primary_product} confidence=${r.confidence} manual_review=${r.manual_review}`);
      console.log(`-> ${f}`);
      return 0;
    }
    case 'validate-product': {
      const r = validateCatalog();
      const id = process.argv[3];
      const errs = r.errors.filter((e) => !id || e.startsWith(id));
      console.log(`catalog ok=${r.ok} errors=${r.errors.length}`);
      errs.slice(0, 20).forEach((e) => console.log('  ' + e));
      return r.ok ? 0 : 1;
    }
    case 'validate-evidence': {
      const file = process.argv[3];
      const claims = JSON.parse(readFileSync(file, 'utf8'));
      const r = checkClaims(Array.isArray(claims) ? claims : claims.evidence || []);
      console.log(`evidence ok=${r.ok} failed=${r.failed} facts=${r.facts} inferences=${r.inferences} hypotheses=${r.hypotheses}`);
      return r.ok ? 0 : 1;
    }
    case 'price-check': {
      const id = process.argv[3];
      const amount = arg('--amount') ? Number(arg('--amount')) : null;
      const g = priceGuard(id, amount);
      console.log(`price-check ${id}: ok=${g.ok} status=${g.status}`);
      g.errors.forEach((e) => console.log('  ERROR ' + e));
      g.warnings.forEach((w) => console.log('  WARN  ' + w));
      return g.ok ? 0 : 1;
    }
    case 'scope-check': {
      const id = process.argv[3];
      const s = validateScope(id);
      console.log(`scope-check ${id}: ok=${s.ok} errors=${s.errors.length} warnings=${s.warnings.length}`);
      s.errors.forEach((e) => console.log('  ERROR ' + e));
      return s.ok ? 0 : 1;
    }
    case 'create-offer': {
      const prof = profile(arg('--profile'));
      const pid = arg('--product');
      if (!prof || !pid) { console.error('need --profile and --product'); return 3; }
      const o = buildOffer({ profile: prof, product_id: pid, evidence: prof.evidence });
      if (!o.ok) { console.error(o.error); return 2; }
      const v = validateOffer(o.offer);
      const f = out(`offer_${prof.profile_id}_${pid}.json`, o.offer);
      console.log(`offer ${o.offer.approval_state} send_allowed=${o.offer.send_allowed} valid=${v.ok} blockers=${o.offer.blockers.join(',') || 'none'}`);
      console.log(`-> ${f}`);
      return v.ok ? 0 : 1;
    }
    case 'create-proposal': {
      const prof = profile(arg('--profile'));
      const pid = arg('--product');
      if (!prof || !pid) { console.error('need --profile and --product'); return 3; }
      const o = buildOffer({ profile: prof, product_id: pid, evidence: prof.evidence });
      if (!o.ok) { console.error(o.error); return 2; }
      const prop = generateProposal(o, { requested_label: arg('--label') || 'INTERNAL_REVIEW', client: '[TEST_ONLY]' });
      out(`proposal_${prof.profile_id}_${pid}.md`, prop.markdown);
      const f = out(`proposal_${prof.profile_id}_${pid}.json`, prop.json);
      console.log(`proposal ${prop.approval_state} send_allowed=false -> ${f}`);
      return 0;
    }
    case 'create-draft': {
      const prof = profile(arg('--profile'));
      const d = buildDraft({ draft_type: arg('--type') || 'first_contact', channel: arg('--channel') || 'email', profile: prof, product: product(arg('--product')), evidence: prof?.evidence });
      const v = validateDraft(d);
      const f = out(`draft_${prof?.profile_id}_${arg('--type') || 'first_contact'}.json`, d.draft);
      console.log(`draft ok=${d.ok} send_allowed=${d.draft.send_allowed} valid=${v.ok} errors=${d.errors.join(';') || 'none'}`);
      console.log(`-> ${f}`);
      return d.ok ? 0 : 1;
    }
    case 'simulate-funnel': {
      const input = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      const r = simulate(input);
      const f = out(`funnel_${input.name || 'scenario'}.json`, r);
      console.log(`funnel expected_deals=${r.expected_deals} revenue_mid=${r.expected_revenue_range.mid} bottleneck=${r.bottleneck}`);
      console.log(`-> ${f}`);
      return 0;
    }
    case 'capacity': {
      const input = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      const r = plan(input);
      const f = out(`capacity_${input.name || 'scenario'}.json`, r);
      console.log(`capacity status=${r.status} max_monthly_volume=${r.max_monthly_volume} overload=${r.overload_risk}`);
      console.log(`-> ${f}`);
      return 0;
    }
    case 'dashboard-refresh': {
      // Lightweight: writes a generated dashboard snapshot from catalog.
      const cat = catalog();
      const byStatus = {};
      cat.products.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
      const snap = { generated_ts: TS, products: cat.products.length, by_status: byStatus };
      const f = out('revenue_dashboard_snapshot.json', snap);
      console.log(`dashboard refreshed: ${JSON.stringify(byStatus)} -> ${f}`);
      return 0;
    }
    case 'validate-all': {
      const r = validateAll();
      console.log(`validate-all ok=${r.ok}`);
      for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`);
      return r.ok ? 0 : 1;
    }
    default:
      console.log('revenue commands: products | product <id> | recommend --profile <id> | validate-product [id] |');
      console.log('  validate-evidence <file> | price-check <id> [--amount N] | scope-check <id> |');
      console.log('  create-offer --profile <id> --product <id> | create-proposal --profile <id> --product <id> [--label L] |');
      console.log('  create-draft --profile <id> --type T --channel C | simulate-funnel <file> | capacity <file> |');
      console.log('  dashboard-refresh | validate-all');
      return cmd ? 3 : 0;
  }
}

process.exit(main());
