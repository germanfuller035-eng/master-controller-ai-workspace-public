// tools/finance_os/lib/registry_contract.mjs
// Project Registry proposal for finance-os. Does NOT write canonical registry during soak.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT } from './common.mjs';

export function writeProposal(ts) {
  const dir = path.join(GENERATED_ROOT, 'reports');
  mkdirSync(dir, { recursive: true });
  const proposal = {
    schema: 'finance_os.registry_proposal.v1',
    generated_ts: ts || 'UNSTAMPED',
    note: 'Proposed Project Registry addition. NOT applied to canonical registry during soak.',
    target: '00_MASTER_CONTEXT/PROJECT_REGISTRY.md (owner-applied post-soak)',
    finance_os_project_entry: {
      project_id: 'finance-os', name: 'Finance OS / Business Control Center',
      status: 'ACTIVE_DEVELOPMENT', priority: 'P1_REVENUE',
      source_of_truth: 'tools/finance_os + docs_canonical_proposed/07_revenue_os/finance_os_command_center.md',
      note: 'Resolves the task-ledger warning (finance-os not yet in registry).',
    },
  };
  const out = path.join(dir, 'registry_proposal.json');
  writeFileSync(out, JSON.stringify(proposal, null, 2));
  return out;
}
