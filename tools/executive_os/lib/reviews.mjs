// tools/executive_os/lib/reviews.mjs
// Phase 17-22: KPI tree loader + daily/weekly/monthly/quarterly reviews + operating cadence.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EXEC_ROOT } from './common.mjs';

let KPIS = null;
export function kpiTree() { if (!KPIS) KPIS = JSON.parse(readFileSync(path.join(EXEC_ROOT, 'data/kpi_tree.json'), 'utf8')); return KPIS.kpis; }

export function evaluateKPIs(values = {}) {
  return kpiTree().map((k) => {
    const v = values[k.kpi_id] || {};
    return { kpi_id: k.kpi_id, name: k.name, source_system: k.source_system, source_field: k.source_field, frequency: k.frequency, value: v.value ?? 'UNKNOWN', status: v.status || (v.value != null ? k.default_status : 'UNKNOWN'), target: v.target ?? 'UNKNOWN', threshold: k.threshold, references_authoritative: true };
  });
}

// Phase 18: Daily owner view (compact).
export function dailyView(ctx) {
  return {
    schema: 'executive_os.daily_view.v1',
    primary_action: ctx.primary_action || 'wait',
    decisions_required: (ctx.ready_decisions || []).slice(0, 5),
    critical_exceptions: (ctx.critical_exceptions || []).slice(0, 5),
    blocked_by_owner: ctx.blocked_by_owner || [],
    blocked_externally: ctx.blocked_externally || [],
    ai_tasks_in_progress: ctx.ai_tasks || [],
    revenue_focus: ctx.revenue_focus || 'mini_audit (entry product)',
    delivery_focus: ctx.delivery_focus || 'UNKNOWN',
    finance_focus: ctx.finance_focus || 'UNKNOWN',
    system_health: ctx.system_health || 'soak in progress (FREEZE)',
    intentionally_waiting: ctx.waiting || ['production changes (soak)'],
    note: 'Compact. Not raw data.',
  };
}

// Phase 19: Weekly operating review.
export function weeklyReview(ctx) {
  const json = {
    schema: 'executive_os.weekly_review.v1',
    period: ctx.period || 'this week',
    commitments_last_week: ctx.commitments || [],
    completed: ctx.completed || [],
    missed: ctx.missed || [],
    reasons: ctx.reasons || [],
    project_changes: ctx.project_changes || [],
    product_readiness: ctx.product_readiness || 'see Revenue OS',
    pipeline: ctx.pipeline || 'see Revenue OS funnel',
    delivery: ctx.delivery || 'see Delivery OS',
    finances: ctx.finances || 'see Finance OS',
    capacity: ctx.capacity || 'UNKNOWN',
    risks: ctx.risks || [],
    decisions: ctx.decisions || [],
    next_week_top_three: ctx.top_three || [],
    tasks_for_claude: ctx.claude_tasks || [],
    tasks_for_cline: ctx.cline_tasks || [],
    owner_tasks: ctx.owner_tasks || [],
    deferred: ctx.deferred || [],
  };
  return { json, markdown: renderReview('Weekly Operating Review', json), actions: json.owner_tasks, decisions: json.decisions };
}

// Phase 20: Monthly business review (integrates Finance OS close as source, not duplicate).
export function monthlyReview(ctx) {
  const json = {
    schema: 'executive_os.monthly_review.v1',
    period: ctx.period || 'this month',
    strategic_progress: ctx.strategic_progress || [],
    revenue: ctx.revenue || 'see Finance OS P&L (CONFIRMED only)',
    cashflow: ctx.cashflow || 'see Finance OS cashflow',
    project_profitability: ctx.project_profitability || 'see Finance OS profitability',
    product_readiness: ctx.product_readiness || 'see Revenue OS',
    delivery_quality: ctx.delivery_quality || 'see Delivery OS QA',
    owner_capacity: ctx.owner_capacity || 'UNKNOWN',
    infrastructure: ctx.infrastructure || 'soak/production health',
    risks: ctx.risks || [],
    decisions: ctx.decisions || [],
    stopped_projects: ctx.stopped || [],
    next_month_priorities: ctx.next_priorities || [],
    budget_implications: ctx.budget || 'see Finance OS budget',
    finance_close_source: 'Finance OS monthly close (required source, not duplicated)',
  };
  return { json, markdown: renderReview('Monthly Business Review', json) };
}

// Phase 21: Quarterly planning (PROPOSED_INTERNAL).
export function quarterlyPlanning(ctx) {
  return {
    schema: 'executive_os.quarterly_planning.v1',
    label: 'PROPOSED_INTERNAL',
    proposed_objectives: ctx.objectives || [],
    key_results: ctx.key_results || [],
    projects_to_focus: ctx.focus || [],
    projects_to_pause: ctx.pause || [],
    capacity_allocation: ctx.capacity_allocation || 'UNKNOWN',
    financial_assumptions: ctx.assumptions || [],
    owner_decisions: ctx.owner_decisions || [],
    risk_register: ctx.risks || [],
    note: 'No automatic approval.',
  };
}

// Phase 22: Operating cadence (future scheduling contract only — no jobs scheduled).
export function operatingCadence() {
  return {
    schema: 'executive_os.cadence.v1',
    daily: ['next action', 'critical exception', 'decision queue'],
    weekly: ['execution review', 'priorities', 'capacity', 'blockers'],
    monthly: ['finance close', 'portfolio', 'product readiness', 'strategic review'],
    quarterly: ['objectives', 'portfolio reset', 'investment decisions'],
    event_driven: ['production incident', 'client payment risk', 'critical delivery failure', 'secret exposure', 'backup failure', 'release acceptance failure'],
    scheduling: 'FUTURE_CONTRACT_ONLY — no external jobs scheduled in this task',
  };
}

function renderReview(title, j) {
  const L = [`# ${title}`, '', `> INTERNAL_OWNER_ONLY · period: ${j.period}`, ''];
  for (const [k, v] of Object.entries(j)) {
    if (k === 'schema' || k === 'period') continue;
    L.push(`## ${k.replace(/_/g, ' ')}`);
    if (Array.isArray(v)) { if (!v.length) L.push('- (none)'); else v.forEach((x) => L.push(`- ${typeof x === 'object' ? JSON.stringify(x) : x}`)); }
    else L.push(String(v));
    L.push('');
  }
  return L.join('\n');
}
