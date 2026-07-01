// tools/executive_os/lib/dependencies.mjs
// Phase 14: Dependency Graph across projects/products/releases/decisions/credentials/infra/etc.
// Detects cycles, missing/stale deps, blocked chains, single points of failure, critical path.

// nodes: [{id, type, status}], edges: [{from, to, kind}]  (from depends on to)
export function analyzeDependencies(nodes, edges) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const errors = [];
  const warnings = [];

  // Missing dependency.
  for (const e of edges) {
    if (!byId[e.from]) errors.push(`edge from missing node ${e.from}`);
    if (!byId[e.to]) errors.push(`dependency target missing: ${e.to} (needed by ${e.from})`);
  }

  // Cycle detection.
  const adj = {};
  nodes.forEach((n) => (adj[n.id] = []));
  for (const e of edges) if (byId[e.from] && byId[e.to]) adj[e.from].push(e.to);
  const color = {}; nodes.forEach((n) => (color[n.id] = 0));
  let cycle = null; const stack = [];
  function dfs(id) {
    if (cycle) return; color[id] = 1; stack.push(id);
    for (const d of adj[id]) {
      if (color[d] === 1) { cycle = [...stack.slice(stack.indexOf(d)), d]; return; }
      if (color[d] === 0) dfs(d);
    }
    color[id] = 2; stack.pop();
  }
  for (const n of nodes) if (color[n.id] === 0) dfs(n.id);

  // Blocked chains: a node depends on a BLOCKED/incomplete node.
  const blockedChains = [];
  for (const e of edges) {
    const target = byId[e.to];
    if (target && /BLOCKED|PLANNED|UNKNOWN|NEEDS_DATA|not_ready|DRAFT/i.test(target.status || '')) {
      blockedChains.push({ blocked: e.from, by: e.to, reason: target.status });
    }
  }

  // Single point of failure: a node many others depend on.
  const inDegree = {};
  for (const e of edges) inDegree[e.to] = (inDegree[e.to] || 0) + 1;
  const spof = Object.entries(inDegree).filter(([, c]) => c >= 3).map(([id, c]) => ({ node: id, dependents: c }));

  // Hidden owner dependency: any chain ending in an owner decision/credential.
  const ownerDeps = edges.filter((e) => byId[e.to] && (byId[e.to].type === 'owner_decision' || byId[e.to].type === 'credential')).map((e) => ({ node: e.from, owner_dependency: e.to }));

  // Domain rules.
  for (const e of edges) {
    const f = byId[e.from], t = byId[e.to];
    if (f && t && f.type === 'sale' && t.type === 'delivery' && /not_ready|DRAFT|PLANNED/i.test(t.status || '')) warnings.push(`product sold before delivery ready: ${e.from} -> ${e.to}`);
    if (f && t && f.type === 'project_start' && t.type === 'financial_approval' && t.status !== 'APPROVED') warnings.push(`project start before financial approval: ${e.from}`);
  }

  // Critical path (longest chain) when acyclic.
  let criticalPath = [];
  if (!cycle) {
    const memo = {};
    function longest(id) {
      if (memo[id]) return memo[id];
      let best = [id];
      for (const d of adj[id]) { const sub = longest(d); if (sub.length + 1 > best.length) best = [id, ...sub]; }
      memo[id] = best; return best;
    }
    for (const n of nodes) { const p = longest(n.id); if (p.length > criticalPath.length) criticalPath = p; }
  }

  return {
    ok: errors.length === 0 && !cycle,
    errors, warnings,
    circular_dependency: cycle,
    blocked_chains: blockedChains,
    single_points_of_failure: spof,
    owner_dependencies: ownerDeps,
    critical_path: criticalPath,
    node_count: nodes.length, edge_count: edges.length,
  };
}
