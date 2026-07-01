// tools/delivery_os/lib/assets.mjs
// Phase 23: Client-facing asset factory. Markdown + JSON. Default INTERNAL_DRAFT. No sending.
// No asset becomes CLIENT_READY without validation.
import { ASSET_LABEL } from './common.mjs';

export const ASSET_TYPES = [
  'kickoff_document', 'input_request_checklist', 'project_plan', 'milestone_summary',
  'review_request', 'change_request_summary', 'delivery_note', 'acceptance_form',
  'handoff_guide', 'support_guide', 'closure_summary',
];

// Resolve label: CLIENT_READY only when gates pass.
export function resolveLabel(requested, gates) {
  const pass = gates && gates.owner_approved === true && gates.qa_passed === true && gates.validated === true;
  if (requested === 'CLIENT_READY') return pass ? 'CLIENT_READY' : 'OWNER_REVIEW';
  if (requested === 'DELIVERED') return gates && gates.accepted ? 'DELIVERED' : 'OWNER_REVIEW';
  return requested && ASSET_LABEL.includes(requested) ? requested : 'INTERNAL_DRAFT';
}

// input: { type, project, data, requested_label, gates }
export function buildAsset(input) {
  if (!ASSET_TYPES.includes(input.type)) return { ok: false, error: `unknown asset type ${input.type}` };
  const label = resolveLabel(input.requested_label || 'INTERNAL_DRAFT', input.gates);
  const json = {
    schema: 'delivery_os.client_asset.v1',
    type: input.type,
    project_id: input.project?.project_id || null,
    label,
    send_allowed: false,
    content: renderContent(input.type, input.project, input.data || {}),
  };
  return { ok: true, label, send_allowed: false, json, markdown: renderMarkdown(input.type, json) };
}

function renderContent(type, project, data) {
  const base = { project: project?.name || '[project]' };
  switch (type) {
    case 'kickoff_document': return { ...base, goals: data.goals || [], scope: data.scope || [], timeline: data.timeline || 'relative' };
    case 'input_request_checklist': return { ...base, required_inputs: data.required_inputs || [] };
    case 'project_plan': return { ...base, milestones: data.milestones || [] };
    case 'milestone_summary': return { ...base, milestones: data.milestones || [] };
    case 'review_request': return { ...base, items_for_review: data.items || [] };
    case 'change_request_summary': return { ...base, change: data.change || {} };
    case 'delivery_note': return { ...base, deliverables: data.deliverables || [], known_limitations: data.limitations || [] };
    case 'acceptance_form': return { ...base, criteria: data.criteria || [] };
    case 'handoff_guide': return { ...base, instructions: data.instructions || [], ownership: data.ownership || 'client' };
    case 'support_guide': return { ...base, support_terms: data.support_terms || 'per agreement' };
    case 'closure_summary': return { ...base, outcome: data.outcome || 'delivered', next_step: data.next_step || 'support' };
    default: return base;
  }
}

function renderMarkdown(type, json) {
  const L = [];
  L.push(`# ${type.replace(/_/g, ' ')} — ${json.content.project}`);
  L.push('');
  L.push(`> **${json.label}** · send_allowed=false · internal until owner-approved`);
  L.push('');
  for (const [k, v] of Object.entries(json.content)) {
    if (k === 'project') continue;
    L.push(`## ${k.replace(/_/g, ' ')}`);
    if (Array.isArray(v)) v.forEach((x) => L.push(`- ${typeof x === 'object' ? JSON.stringify(x) : x}`));
    else if (typeof v === 'object') L.push('```json\n' + JSON.stringify(v, null, 2) + '\n```');
    else L.push(String(v));
    L.push('');
  }
  return L.join('\n');
}
