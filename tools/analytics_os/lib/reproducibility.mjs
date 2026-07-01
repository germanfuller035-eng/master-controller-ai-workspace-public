// tools/analytics_os/lib/reproducibility.mjs
// Report reproducibility (Phase 23). Deterministic report envelope + hash. No Date.now/random.
import { checksum } from './snapshot.mjs';

// Wrap a report body in a reproducibility envelope. All volatile inputs are passed in.
export function makeReproducible(report, { report_version = '1.0', ts = 'UNSTAMPED', source_snapshots = [], source_commits = [], formulas = {}, filters = {}, exclusions = [], confidence = 'MODEL_ESTIMATE', synthetic = true } = {}) {
  const envelope = {
    report_version,
    generated_at: ts,
    source_snapshots,
    source_commits,
    formulas,
    filters,
    exclusions,
    confidence,
    synthetic_marker: synthetic ? 'SYNTHETIC' : 'LIVE',
    body: report,
  };
  // Hash excludes generated_at so identical content hashes identically regardless of stamp.
  const { generated_at, ...hashable } = envelope;
  envelope.checksum = checksum(JSON.stringify(hashable));
  return envelope;
}

// Verify two report envelopes are reproductions of each other (same content hash).
export function isReproduction(a, b) {
  return a.checksum === b.checksum;
}
