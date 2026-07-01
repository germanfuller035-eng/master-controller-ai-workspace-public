// tools/executive_os/lib/nba.mjs
// Phase 12: Next Best Action engine. Deterministic. During soak NEVER recommends production mutation.
import { PRODUCTION_FREEZE } from './common.mjs';

// Production-mutation actions that are forbidden during freeze.
const PRODUCTION_ACTIONS = /deploy|restart|reboot|send|autosend|mutate|production push|go live|live send/i;

// input: { decisions:[{decision_id,score,status}], blockers, priorities, acceptanceItems, capacityKnown,
//          deadlines, freeze }
export function nextBestAction(input) {
  const freeze = input.freeze ?? PRODUCTION_FREEZE;
  const candidates = [];

  // From READY_FOR_OWNER decisions (highest score first).
  for (const d of (input.decisions || []).filter((x) => x.status === 'READY_FOR_OWNER').sort((a, b) => b.score - a.score)) {
    candidates.push({ kind: 'owner_decision', ref: d.decision_id, score: d.score + 5, owner: true, reason: 'ready owner decision' });
  }
  // From acceptance items.
  for (const a of (input.acceptanceItems || [])) {
    candidates.push({ kind: 'acceptance', ref: a, score: 6, owner: true, reason: 'acceptance pending' });
  }
  // Capacity unknown is a high-value owner input.
  if (input.capacityKnown === false) candidates.push({ kind: 'owner_input', ref: 'confirm_weekly_capacity', score: 9, owner: true, reason: 'capacity blocks planning' });

  // AI-performable actions (no owner, no production).
  const aiActions = (input.aiCandidates || []).map((a) => ({ kind: 'ai_task', ref: a, score: 4, owner: false, reason: 'AI can do without owner' }));

  // Filter out production mutations during freeze.
  const safe = [...candidates, ...aiActions].filter((c) => {
    if (freeze && PRODUCTION_ACTIONS.test(c.ref)) { c.blocked = 'production_freeze'; return false; }
    return true;
  });
  const blocked = [...candidates, ...aiActions].filter((c) => c.blocked);

  safe.sort((a, b) => b.score - a.score);
  const primary = safe.find((c) => c.owner) || safe[0] || null;
  const secondary = safe.filter((c) => c !== primary).slice(0, 3);
  const aiNoOwner = safe.filter((c) => !c.owner).slice(0, 5);

  return {
    primary_owner_action: primary ? { action: primary.ref, kind: primary.kind, reason: primary.reason } : 'none — wait',
    secondary_actions: secondary.map((c) => ({ action: c.ref, kind: c.kind, reason: c.reason })),
    ai_actions_without_owner: aiNoOwner.map((c) => c.ref),
    blocked_actions: blocked.map((c) => ({ action: c.ref, blocked_by: c.blocked })),
    freeze_active: freeze,
    note: freeze ? 'Production freeze active — no production mutation recommended.' : 'normal',
  };
}
