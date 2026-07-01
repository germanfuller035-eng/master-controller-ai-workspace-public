// tools/revenue_os/lib/findings.mjs
// Phase 8: Audit finding validation. Duplicate / contradictory / unsupported / stale / missing-source.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REVENUE_ROOT } from './common.mjs';
import { validate } from './schema.mjs';
import { FindingSchema } from '../schemas/domain.mjs';
import { checkClaim } from './evidence.mjs';

let TAX = null;
function taxonomy() {
  if (!TAX) TAX = JSON.parse(readFileSync(path.join(REVENUE_ROOT, 'data/audit_taxonomy.json'), 'utf8'));
  return TAX;
}
function categoryKeys() { return taxonomy().categories.map((c) => c.key); }

export function checkFinding(finding) {
  const errors = [];
  const warnings = [];
  const shape = validate(finding, FindingSchema, finding.finding_id || 'finding');
  if (!shape.ok) errors.push(...shape.errors);

  // Category must be in taxonomy.
  if (finding.category && !categoryKeys().includes(finding.category)) {
    errors.push(`unknown category: ${finding.category}`);
  }

  // A finding's "fact" must be supported by at least one FACT-type evidence claim with a source.
  const ev = finding.evidence || [];
  const supportedFact = ev.some((c) => c.claim_type === 'FACT' && (c.source_url || c.source_type === 'direct_observation'));
  if (!supportedFact) errors.push('unsupported finding: no FACT evidence with a source');
  if (ev.length === 0) errors.push('finding has no evidence');

  // Each evidence claim passes the evidence gate.
  ev.forEach((c, i) => {
    const r = checkClaim(c);
    r.errors.forEach((e) => errors.push(`evidence[${i}]: ${e}`));
    r.warnings.forEach((w) => warnings.push(`evidence[${i}]: ${w}`));
  });

  // Stale evidence.
  if (ev.some((c) => c.freshness === 'stale')) warnings.push('finding relies on stale evidence');

  return { ok: errors.length === 0, errors, warnings };
}

export function checkFindingSet(findings) {
  const perFinding = findings.map((f) => ({ finding_id: f.finding_id, ...checkFinding(f) }));

  // Duplicate detection (same category + normalized title).
  const seen = new Map();
  const duplicates = [];
  for (const f of findings) {
    const key = `${f.category}::${(f.title || '').trim().toLowerCase()}`;
    if (seen.has(key)) duplicates.push({ finding_id: f.finding_id, duplicate_of: seen.get(key) });
    else seen.set(key, f.finding_id);
  }

  // Contradiction detection (same category, one asserts presence, another absence).
  const contradictions = [];
  const byCat = {};
  for (const f of findings) { (byCat[f.category] = byCat[f.category] || []).push(f); }
  for (const [cat, fs_] of Object.entries(byCat)) {
    const absence = fs_.filter((f) => /(нет|отсутств|no |missing|без )/i.test(f.fact || ''));
    const presence = fs_.filter((f) => /(есть|присутств|has |present|имеется)/i.test(f.fact || ''));
    if (absence.length && presence.length) {
      contradictions.push({ category: cat, absence: absence.map((f) => f.finding_id), presence: presence.map((f) => f.finding_id) });
    }
  }

  const failed = perFinding.filter((r) => !r.ok).length;
  return {
    ok: failed === 0 && duplicates.length === 0 && contradictions.length === 0,
    total: findings.length,
    failed,
    duplicates,
    contradictions,
    per_finding: perFinding,
  };
}
