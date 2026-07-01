// tools/delivery_os/lib/registry_contract.mjs
// Phase 28: Project Registry integration contract. A won/test client project becomes a Project
// Registry item. Does NOT write the canonical registry during soak — produces a proposed addition.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_ROOT } from './common.mjs';

// Map a ClientProject to a Project Registry row proposal.
export function toRegistryItem(project, opts = {}) {
  if (!project) return { ok: false, error: 'no project' };
  const errors = [];
  if (!project.project_id) errors.push('missing project_id');
  if (!project.product_id) errors.push('missing product_id');
  if (!project.owner) errors.push('missing owner');
  if (errors.length) return { ok: false, errors };

  const item = {
    project_id: project.project_id,
    name: opts.client_safe_name || `Delivery: ${project.name}`.replace(/[^\w\s:/-]/g, ''),
    product_id: project.product_id,
    status: mapStatus(project.status),
    priority: project.priority || 'P2',
    owner: project.owner,
    source_of_truth: `Delivery OS project record (${project.project_id})`,
    context_pack: `node tools/ai_hq/context_pack_builder.mjs --project delivery-os --agent claude`,
    task_ledger: '_generated/ai_hq/task_ledger.jsonl',
    risk: opts.risk || 'low',
    next_milestone: opts.next_milestone || 'kickoff',
    sensitive: !!opts.sensitive,
    test_only: !!project.test_only,
  };
  return { ok: true, item };
}

function mapStatus(s) {
  const m = {
    PLANNED: 'PLANNED', WAITING_CLIENT_INPUT: 'ACTIVE_DEVELOPMENT', READY_TO_START: 'ACTIVE_DEVELOPMENT',
    IN_PROGRESS: 'ACTIVE_DEVELOPMENT', BLOCKED: 'BLOCKED_EXTERNAL', IN_REVIEW: 'ACCEPTANCE',
    WAITING_CLIENT_APPROVAL: 'ACCEPTANCE', DELIVERED: 'ACCEPTANCE', ACCEPTED: 'MAINTENANCE',
    SUPPORT: 'MAINTENANCE', CLOSED: 'ARCHIVED', CANCELLED: 'ARCHIVED',
  };
  return m[s] || 'UNKNOWN';
}

// Write a proposed registry addition file (NOT the canonical registry).
export function writeProposal(items, ts) {
  const dir = path.join(GENERATED_ROOT, 'reports');
  mkdirSync(dir, { recursive: true });
  const proposal = {
    schema: 'delivery_os.registry_proposal.v1',
    generated_ts: ts || 'UNSTAMPED',
    note: 'Proposed Project Registry additions. NOT applied to canonical registry during soak.',
    target: '00_MASTER_CONTEXT/PROJECT_REGISTRY.md (owner-applied post-soak)',
    delivery_os_project_entry: {
      project_id: 'delivery-os', name: 'Delivery OS / Client Project Factory',
      status: 'ACTIVE_DEVELOPMENT', priority: 'P1_REVENUE',
      source_of_truth: 'tools/delivery_os + docs_canonical_proposed/07_revenue_os/delivery_os_command_center.md',
      note: 'Resolves the task-ledger warning (delivery-os not yet in registry).',
    },
    client_project_items: items,
  };
  const out = path.join(dir, 'registry_proposal.json');
  writeFileSync(out, JSON.stringify(proposal, null, 2));
  return out;
}
