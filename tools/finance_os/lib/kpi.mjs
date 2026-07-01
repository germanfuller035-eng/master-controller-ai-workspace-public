// tools/finance_os/lib/kpi.mjs
// Phase 24: Financial KPI system. Loads definitions; evaluates values with status + warning.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FINANCE_ROOT } from './common.mjs';

let DEFS = null;
export function kpiDefinitions() {
  if (!DEFS) DEFS = JSON.parse(readFileSync(path.join(FINANCE_ROOT, 'data/kpi_definitions.json'), 'utf8'));
  return DEFS.kpis;
}

// values: { kpi_key: {value, status, target} }
export function evaluateKPIs(values = {}) {
  return kpiDefinitions().map((def) => {
    const v = values[def.key] || {};
    let warning = false;
    // Simple threshold heuristics for the numeric-comparable KPIs.
    if (typeof v.value === 'number') {
      if (def.key === 'gross_margin' && v.value < 0.5) warning = true;
      if (def.key === 'operating_result' && v.value < 0) warning = true;
      if (def.key === 'cash_runway' && v.value < 3) warning = true;
      if (def.key === 'reserve_coverage' && v.value < 1.0) warning = true;
      if (def.key === 'average_payment_delay' && v.value > 14) warning = true;
      if (def.key === 'project_margin' && v.value < 0.2) warning = true;
      if (def.key === 'client_concentration' && v.value > 0.4) warning = true;
      if (def.key === 'overdue_receivables' && v.value > 0) warning = true;
    }
    return {
      key: def.key, definition: def.definition, formula: def.formula, source: def.source,
      frequency: def.frequency,
      value: v.value ?? 'UNKNOWN',
      status: v.status || (v.value != null ? def.default_status : 'UNKNOWN'),
      target: v.target ?? 'UNKNOWN',
      confidence: v.status || def.default_status,
      warning_threshold: def.warning_threshold,
      warning,
    };
  });
}
