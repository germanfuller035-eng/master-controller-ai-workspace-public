// tools/analytics_os/lib/lineage.mjs
// Data lineage graph + integrity detectors (Phase 7). Read-only, dependency-free.

// A lineage graph is a list of edges { from, to, transform, code_ref?, stale? }.
// Build adjacency + detect issues.
export function buildLineage(edges) {
  const nodes = new Set();
  for (const e of edges) { nodes.add(e.from); nodes.add(e.to); }
  return { nodes: [...nodes], edges };
}

// Detect a cycle via DFS.
export function detectCycle(edges) {
  const adj = {};
  for (const e of edges) (adj[e.from] ||= []).push(e.to);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  let cyclePath = null;
  function dfs(n, stack) {
    color[n] = GRAY;
    for (const m of adj[n] || []) {
      if (color[m] === GRAY) { cyclePath = [...stack, n, m]; return true; }
      if (color[m] === undefined && dfs(m, [...stack, n])) return true;
    }
    color[n] = BLACK;
    return false;
  }
  for (const n of Object.keys(adj)) if (color[n] === undefined && dfs(n, [])) break;
  return cyclePath;
}

// Full lineage integrity scan.
// metrics: catalog metrics; dashboards: [{id, metric_ids}]; edges: lineage edges.
export function lineageScan({ edges = [], metrics = [], dashboards = [] }) {
  const issues = [];
  const targets = new Set(edges.map((e) => e.to));
  const sources = new Set(edges.map((e) => e.from));

  // metric without lineage (no edge leads into a node referencing it)
  for (const m of metrics) {
    const hasLineage = edges.some((e) => e.to === `metric:${m.metric_id}` || e.to === m.metric_id);
    if (!hasLineage) issues.push({ kind: 'METRIC_WITHOUT_LINEAGE', ref: m.metric_id, severity: 'HIGH' });
  }
  // dashboard without metric
  for (const d of dashboards) {
    if (!Array.isArray(d.metric_ids) || d.metric_ids.length === 0) issues.push({ kind: 'DASHBOARD_WITHOUT_METRIC', ref: d.id, severity: 'MEDIUM' });
  }
  // transformation without code reference
  for (const e of edges) {
    if (e.transform && e.transform !== 'identity' && !e.code_ref) issues.push({ kind: 'TRANSFORM_WITHOUT_CODE_REF', ref: `${e.from}->${e.to}`, severity: 'MEDIUM' });
    if (e.stale === true) issues.push({ kind: 'STALE_SOURCE', ref: e.from, severity: 'HIGH' });
    if (e.manual_override === true) issues.push({ kind: 'HIDDEN_MANUAL_OVERRIDE', ref: `${e.from}->${e.to}`, severity: 'HIGH' });
  }
  // circular lineage
  const cycle = detectCycle(edges);
  if (cycle) issues.push({ kind: 'CIRCULAR_LINEAGE', ref: cycle.join('->'), severity: 'CRITICAL' });

  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  issues.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return { total: issues.length, issues, node_count: new Set([...targets, ...sources]).size };
}
