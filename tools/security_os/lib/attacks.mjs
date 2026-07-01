// tools/security_os/lib/attacks.mjs
// MP43 — 35 synthetic attack scenarios. Each returns a deterministic verdict: the control that
// blocks/detects it. NO real exploit, no network, no production. Pure functions over fixtures.
import { scanSecrets, scanSensitive } from './scanners.mjs';

// Each scenario: given a synthetic payload, the relevant control must DETECT/BLOCK it.
export const ATTACKS = {
  '1_secret_in_source': (p) => ({ blocked: scanSecrets(p.text).some((f) => !f.false_positive), control: 'secret_scanner' }),
  '2_secret_in_report': (p) => ({ blocked: scanSecrets(p.text).some((f) => !f.false_positive), control: 'no_secret_in_reports' }),
  '3_secret_in_backup': (p) => ({ blocked: scanSecrets(p.text).some((f) => !f.false_positive), control: 'backup_no_secret' }),
  '4_real_email_in_fixture': (p) => ({ blocked: scanSensitive(p.text).some((f) => f.type === 'real_email'), control: 'sensitive_scanner' }),
  '5_raw_body_in_analytics': (p) => ({ blocked: p.has_full_body === true, control: 'privacy_minimization_no_body' }),
  '6_telegram_token_in_log': (p) => ({ blocked: scanSecrets(p.text).some((f) => f.type === 'telegram_token' && !f.false_positive), control: 'log_redaction' }),
  '7_ssh_key_header': (p) => ({ blocked: scanSecrets(p.text).some((f) => f.type === 'private_key'), control: 'secret_scanner_private_key' }),
  '8_unauthorized_canonical_writer': (p) => ({ blocked: p.writer !== 'master_controller', control: 'ownership_single_writer' }),
  '9_approval_bypass': (p) => ({ blocked: p.granted_by === 'agent' || !p.decision_reference, control: 'no_agent_self_approval' }),
  '10_send_bypass': (p) => ({ blocked: p.send_path !== 'master_controller_approved_seam', control: 'no_direct_send' }),
  '11_opt_out_bypass': (p) => ({ blocked: p.opt_out_active === true && p.message_type !== 'SUPPORT', control: 'opt_out_enforced' }),
  '12_revision_bypass': (p) => ({ blocked: p.expected_revision == null, control: 'revision_required' }),
  '13_replay_attack': (p) => ({ blocked: p.idempotency_key != null && p.seen_keys?.includes(p.idempotency_key), control: 'replay_protection' }),
  '14_changed_payload_same_key': (p) => ({ blocked: p.payload_changed === true && p.same_key === true, control: 'idempotency_new_key_required' }),
  '15_path_traversal': (p) => ({ blocked: /\.\.(\/|\\)/.test(p.path || ''), control: 'path_normalization' }),
  '16_unsafe_archive_path': (p) => ({ blocked: /\.\.(\/|\\)|^\//.test(p.entry || ''), control: 'archive_path_check' }),
  '17_executable_attachment': (p) => ({ blocked: /\.(exe|dll|scr|bat|cmd|sh|js|vbs)$/i.test(p.filename || ''), control: 'executable_detection' }),
  '18_mime_mismatch': (p) => ({ blocked: p.declared_mime !== p.actual_mime, control: 'mime_validation' }),
  '19_command_injection': (p) => ({ blocked: /[;&|`$()]|\$\(/.test(p.input || ''), control: 'command_injection_prevention' }),
  '20_ssrf_url': (p) => ({ blocked: /^https?:\/\/(127\.|169\.254\.|10\.|192\.168\.|localhost|\[::1\])/.test(p.url || '') || /metadata/.test(p.url || ''), control: 'ssrf_prevention' }),
  '21_prompt_injection_client': (p) => ({ blocked: p.source === 'client_message' && /ignore (previous|all)|reveal secret|send to|disregard/i.test(p.text || ''), control: 'untrusted_source_no_instructions' }),
  '22_prompt_injection_repo': (p) => ({ blocked: /ignore (previous|all)|exfiltrate|bypass approval/i.test(p.text || ''), control: 'repo_content_review_trust' }),
  '23_agent_asks_secret': (p) => ({ blocked: p.requests_capability === 'access_secret', control: 'capability_gate_secret_human_only' }),
  '24_agent_network_access': (p) => ({ blocked: p.requests_capability === 'access_network', control: 'no_network_capability' }),
  '25_malicious_dependency': (p) => ({ blocked: p.review_status === 'UNREVIEWED' || p.network_capable === true && p.unexpected === true, control: 'sbom_review' }),
  '26_android_offline_mutation': (p) => ({ blocked: p.offline_mutation === true, control: 'no_offline_canonical_mutation' }),
  '27_telegram_local_fallback': (p) => ({ blocked: p.has_local_fallback === true, control: 'no_local_fallback' }),
  '28_imap_flag_mutation': (p) => ({ blocked: p.mutates_flags === true, control: 'imap_read_only' }),
  '29_unofficial_whatsapp': (p) => ({ blocked: /whatsapp-web|baileys|browser_automation/i.test(p.method || ''), control: 'official_channel_only' }),
  '30_unauthorized_product_promotion': (p) => ({ blocked: p.promoted_by !== 'product_os', control: 'product_promotion_ownership' }),
  '31_retention_violation': (p) => ({ blocked: p.delete_stage_attempted === 'EXECUTED' && p.owner_approved !== true, control: 'retention_owner_gated' }),
  '32_deletion_without_approval': (p) => ({ blocked: p.owner_approved !== true, control: 'deletion_owner_approval' }),
  '33_incident_leaked_credential': (p) => ({ blocked: p.prints_value !== true && p.rotation === 'owner_gated', control: 'incident_no_value_print' }),
  '34_exception_without_expiry': (p) => ({ blocked: p.expiry == null, control: 'exception_requires_expiry' }),
  '35_safe_complete_flow': (p) => ({ blocked: false, allowed: true, control: 'all_gates_pass' }),
};

export function runAttack(id, payload) {
  const key = Object.keys(ATTACKS).find((k) => k === id || k.startsWith(id) || k.endsWith(id));
  if (!key) return { id, error: 'unknown attack scenario', blocked: false };
  const r = ATTACKS[key](payload || {});
  return { id: key, ...r };
}
export const ATTACK_IDS = Object.keys(ATTACKS);
