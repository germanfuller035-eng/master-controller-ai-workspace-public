#!/usr/bin/env node
// tools/product_os/product.mjs
// Phase 39: Product OS CLI. Offline, deterministic, no production mutation, no status change, no publish, no send.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT, arg, nowStamp } from './lib/common.mjs';
import { catalog, product } from './lib/catalog.mjs';
import { validateSpec, analyzeDuplication } from './lib/spec.mjs';
import { buildClaimsCatalog, validateClaim } from './lib/claims.mjs';
import { assess, statusGate } from './lib/readiness.mjs';
import { miniAuditReference, boundaryAnalysis, productize, prioritySelection } from './lib/productize.mjs';
import { buildDemo } from './lib/demo.mjs';
import { runPilot } from './lib/pilot.mjs';
import { salesDeliveryConsistency, priceCostCapacity } from './lib/consistency.mjs';
import { productQA } from './lib/qa.mjs';
import { roadmap, ownerDecisions, dashboard } from './lib/dashboard.mjs';
import { validateAll } from './lib/validators.mjs';

const cmd = process.argv[2];
const TS = nowStamp(arg('--ts'));
const OUT = path.join(GENERATED_ROOT, 'samples');
function out(name, data) { mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return f; }

function main() {
  switch (cmd) {
    case 'list': { catalog().forEach((p) => console.log(`${p.product_id.padEnd(24)} ${p.status}`)); return 0; }
    case 'show': { const p = product(process.argv[3]); if (!p) { console.error('not found'); return 2; } console.log(JSON.stringify(p, null, 2)); return 0; }
    case 'inventory': { const inv = catalog().map((p) => ({ product_id: p.product_id, status: p.status, has_price: p.price.status !== 'UNKNOWN' })); out('inventory.json', inv); console.log(`products=${inv.length}`); return 0; }
    case 'claims': { const p = product(process.argv[3]); if (!p) { console.error('not found'); return 2; } const c = buildClaimsCatalog(p.product_id, p.name); out(`claims_${p.product_id}.json`, c); console.log(`claims catalog for ${p.product_id} (owner approval ${c.owner_approval_status})`); return 0; }
    case 'validate': { const v = validateSpec(process.argv[3]); console.log(`spec ${process.argv[3]}: ok=${v.ok} ${v.errors ? v.errors.join(';') : ''}`); return v.ok ? 0 : 1; }
    case 'readiness': { const a = assess(process.argv[3], {}); if (!a.ok && a.error) { console.error(a.error); return 2; } out(`readiness_${process.argv[3]}.json`, a); console.log(`${process.argv[3]}: current=${a.current_status} recommended=${a.recommended_status} score=${a.score} auto_promote=${a.auto_promote}`); return 0; }
    case 'compare': { const d = analyzeDuplication(); const pair = d.findings.find((f) => (f.a === process.argv[3] && f.b === process.argv[4]) || (f.a === process.argv[4] && f.b === process.argv[3])); console.log(pair ? JSON.stringify(pair) : 'no significant overlap'); return 0; }
    case 'pilot': { const r = runPilot(process.argv[3], arg('--scenario') || 'happy'); if (!r.ok) { console.error(r.error); return 2; } out(`pilot_${process.argv[3]}_${arg('--scenario') || 'happy'}.json`, r.pilot); console.log(`pilot ${process.argv[3]}/${r.pilot.scenario}: ${r.pilot.status} blockers=[${r.pilot.blockers.join(',')}]`); return 0; }
    case 'pilot-report': { console.log('see _generated/product_os/samples/pilot_*.json'); return 0; }
    case 'demo': { const d = buildDemo(process.argv[3], arg('--type') || 'sample_report'); if (!d.ok && d.error) { console.error(d.error); return 2; } out(`demo_${process.argv[3]}_${arg('--type') || 'sample_report'}.json`, d.asset); console.log(`demo ${process.argv[3]}: status=${d.asset.status} send=${d.asset.send_allowed} publish=${d.asset.publish_allowed}`); return 0; }
    case 'economics': { const r = priceCostCapacity(process.argv[3], {}); out(`economics_${process.argv[3]}.json`, r); console.log(`${process.argv[3]}: verdict=${r.verdict} price_status=${r.price_status}`); return 0; }
    case 'consistency': { const r = salesDeliveryConsistency(process.argv[3]); out(`consistency_${process.argv[3]}.json`, r); console.log(`${process.argv[3]}: ok=${r.ok} findings=${r.findings.length}`); return 0; }
    case 'roadmap': { const r = roadmap(); out('roadmap.json', r); console.log(`roadmap now=${r.now.length} next=${r.next.length} later=${r.later.length}`); return 0; }
    case 'decisions': { const d = ownerDecisions(); out('owner_decisions.json', d); console.log(`owner decisions: ${d.decisions.length} (ready=${d.decisions.filter((x) => x.status === 'READY_FOR_OWNER').length})`); return 0; }
    case 'dashboard-refresh': { const d = dashboard(); out('product_dashboard.json', d); console.log(`dashboard: catalog=${d.catalog_count} pilot_candidates=${d.pilot_candidates.length}`); return 0; }
    case 'reference': { const r = miniAuditReference(); out('mini_audit_reference.json', r); console.log(`mini audit reference: price ${r.blueprint.price.amount} ${r.blueprint.price.status}, ${r.blueprint.delivery_stages} stages`); return 0; }
    case 'boundary': { const r = boundaryAnalysis(process.argv[3]); if (!r.ok) { console.error(r.error); return 2; } out(`boundary_${process.argv[3]}.json`, r); console.log(`${process.argv[3]}: keep=${r.keep_status} options=${(r.options || []).length}`); return 0; }
    case 'validate-all': { const r = validateAll(); console.log(`validate-all ok=${r.ok}`); for (const [k, v] of Object.entries(r.results)) console.log(`  ${k}: ok=${v.ok} ${v.errors ? 'errors=' + v.errors.length : ''}`); return r.ok ? 0 : 1; }
    default:
      console.log('product commands: list | show <id> | inventory | claims <id> | validate <id> | readiness <id> |');
      console.log('  compare <id1> <id2> | pilot <id> --scenario S | pilot-report | demo <id> --type T | economics <id> |');
      console.log('  consistency <id> | roadmap | decisions | dashboard-refresh | reference | boundary <id> | validate-all');
      return cmd ? 3 : 0;
  }
}
process.exit(main());
