// tools/executive_os/lib/governance.mjs
// Phase 27-28-29: Change control + Release/acceptance governance + Business continuity.
import { RELEASE_STATUS } from './common.mjs';

// Phase 27: change control.
export const OWNER_APPROVAL_REQUIRED = [
  'architecture', 'canonical_writer', 'production_send', 'new_channel', 'product_price', 'product_readiness',
  'real_client_project', 'bank_integration', 'tax_assumptions', 'release_tag', 'git_remote_publication',
  'credentials_purchase', 'major_recurring_cost', 'sensitive_data_policy',
];
export const AI_ALLOWED_NO_APPROVAL = ['offline_tests', 'local_fixtures', 'docs_proposals', 'validators', 'reports', 'backup_verification', 'context_packs'];

export function classifyChange(changeType) {
  if (OWNER_APPROVAL_REQUIRED.includes(changeType)) return { change: changeType, requires_owner_approval: true, ai_allowed: false };
  if (AI_ALLOWED_NO_APPROVAL.includes(changeType)) return { change: changeType, requires_owner_approval: false, ai_allowed: true };
  return { change: changeType, requires_owner_approval: true, ai_allowed: false, note: 'unknown change -> default to owner approval' };
}

// Phase 28: release/acceptance governance. Distinguishes test/deploy/accept/soak/physical/published.
export function releaseGate(release) {
  const errors = [];
  const has = (s) => (release.statuses || []).includes(s);
  // Rules.
  if (release.claim === 'DEPLOYED' && !has('TESTED')) errors.push('deployed without tested');
  if (release.claim === 'OWNER_ACCEPTED' && !has('DEPLOYED')) errors.push('accepted without deployed');
  if (release.claim === 'OWNER_ACCEPTED' && release.owner_interaction !== true) errors.push('owner acceptance without owner interaction (server-side test != owner)');
  if (release.claim === 'OWNER_ACCEPTED' && release.physical_device === false && release.requires_device) errors.push('physical acceptance without device (emulator != physical)');
  if (release.claim === 'SOAK_PASSED' && release.soak_hours < 24) errors.push('soak not complete (T+0 != 24h)');
  if (release.claim === 'RELEASED' && release.tag_published !== true) errors.push('released but tag not published (local tag != published)');
  return {
    claim: release.claim,
    valid: errors.length === 0,
    errors,
    current_truth: release.statuses || [],
    note: 'tested != deployed != accepted; emulator != device; T+0 != soak; local tag != published.',
  };
}

// Phase 29: business continuity.
export const CONTINUITY_RISKS = ['laptop_loss', 'disk_failure', 'no_git_remote', 'lost_ssh_key', 'owner_unavailable', 'expired_credentials', 'broken_vps', 'corrupted_vault', 'missing_backup', 'payment_interruption', 'production_incident'];

export function continuityPlan() {
  const mk = (risk, rpo, rto, backup, restore, ownerDep, gap) => ({ risk, rpo, rto, backup, restore_path: restore, owner_dependency: ownerDep, current_gap: gap });
  return {
    label: 'MANAGERIAL_INTERNAL (no secrets exposed)',
    items: [
      mk('laptop_loss', '1 commit/push', '< 1 day', 'git bundles + D:\\AI_BACKUPS', 'clone bundle on new machine', 'owner provides machine', 'no Git remote yet (owner decision pending)'),
      mk('disk_failure', '1 commit', '< 1 day', 'git bundles', 'restore from bundle', 'owner', 'off-site copy depends on remote decision'),
      mk('no_git_remote', 'n/a', 'n/a', 'local bundles', 'configure remote', 'owner decision d_git_remote', 'OPEN — owner decision required'),
      mk('lost_ssh_key', 'n/a', 'varies', 'keys in D:\\AI_SECRETS', 'regenerate + re-add to VPS', 'owner', 'key rotation policy undocumented'),
      mk('owner_unavailable', 'n/a', 'n/a', 'decision queue + delegation', 'Claude/Cline continue offline work', 'owner for decisions', 'owner is single point for decisions'),
      mk('expired_credentials', 'n/a', 'varies', 'reference only', 'owner renews', 'owner', 'no expiry tracking'),
      mk('broken_vps', 'last backup', '< 1 day (reprovision)', 'VPS backup timers (production)', 'reprovision + restore (post-soak)', 'owner', 'reprovision runbook exists'),
      mk('corrupted_vault', '1 backup cycle', '< 2h', 'canonical backups + manifests', 'restore from backup', 'none', 'vault not in Git (known)'),
      mk('missing_backup', 'n/a', 'n/a', 'backup verifier', 'rerun backup', 'none', 'backup verify is manual'),
      mk('payment_interruption', 'n/a', 'n/a', 'Finance OS receivables', 'manual follow-up (owner-approved)', 'owner', 'no automated reminders (by design)'),
      mk('production_incident', 'last good state', 'rollback runbook', 'release rollback runbook', 'rollback (post-soak, owner-approved)', 'owner', 'frozen during soak'),
    ],
    note: 'Secrets never exposed; credential paths referenced only.',
  };
}
