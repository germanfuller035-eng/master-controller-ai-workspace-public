// tools/security_os/lib/scanners.mjs
// MP27-28 — static secret + sensitive-data scanners. NEVER print a secret value: emit path/line/
// type/fingerprint/severity only. Pure, offline, no network.
import { readFileSync } from 'node:fs';
import { SECRET_PATTERNS, fingerprint } from './common.mjs';

// A real contact = email NOT on a synthetic/test domain.
const REAL_EMAIL_RX = /[A-Za-z0-9._%+-]+@(?!synthetic\.test)(?!example\.test)(?!example\.com)(?!.*\.test\b)[A-Za-z0-9.-]+\.(ru|com|org|net|io)\b/g;
const PHONE_RX = /\+?\d[\d ()-]{9,}\d/g;

// Scan a single text blob. Returns findings with NO raw values.
export function scanSecrets(text, pathRef = '') {
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const p of SECRET_PATTERNS) {
      const m = lines[i].match(p.re);
      if (m) {
        // exclude obvious fake/test vectors
        const isFake = /AAFakeToken|REDACTED|EXAMPLE|process\.env|<TOKEN|placeholder|xxxx/i.test(lines[i]);
        findings.push({ path: pathRef, line: i + 1, type: p.type, fingerprint: fingerprint(m[0]), severity: isFake ? 'INFO' : (p.type === 'generic_high_entropy' ? 'LOW' : 'HIGH'), false_positive: isFake });
      }
    }
  }
  return findings;
}

export function scanSensitive(text, pathRef = '') {
  const findings = [];
  const emails = text.match(REAL_EMAIL_RX) || [];
  for (const e of emails) findings.push({ path: pathRef, type: 'real_email', fingerprint: fingerprint(e), severity: 'MEDIUM' });
  const phones = (text.match(PHONE_RX) || []).filter((p) => p.replace(/\D/g, '').length >= 10);
  for (const p of phones) findings.push({ path: pathRef, type: 'phone', fingerprint: fingerprint(p), severity: 'LOW' });
  return findings;
}

// Convenience for file scanning.
export function scanFileSecrets(path) { try { return scanSecrets(readFileSync(path, 'utf8'), path); } catch { return []; } }
export function scanFileSensitive(path) { try { return scanSensitive(readFileSync(path, 'utf8'), path); } catch { return []; } }
