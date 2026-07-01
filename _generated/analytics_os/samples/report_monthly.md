# Analytics OS — monthly report

generated_ts: 20260617_193000
report_id: analytics_monthly_20260617_193000

> Derived read-only from canonical OS sources; no dashboards/funnels created; no canonical writes.

## KPI snapshot (latest)
| KPI | Value | Unit | Source | Status |
| --- | --- | --- | --- | --- |
| booked_revenue | 25000 | EUR | Finance_OS | OWNER_TARGET |
| cash_collected | 18000 | EUR | Finance_OS | CONFIRMED |
| operating_result | 1200 | EUR | Finance_OS | MODEL_ESTIMATE |
| cash_runway | 2.5 | months | Finance_OS | MODEL_ESTIMATE |
| active_products | 2 | count | Revenue_OS | CONFIRMED |
| acceptance_rate | 0.85 | ratio | Delivery_OS | MODEL_ESTIMATE |

## Trends (first → last)
| KPI | Dir | Δ abs | Δ % | Points |
| --- | --- | --- | --- | --- |
| booked_revenue | ▲ UP | 25000 | — | 5 |
| cash_collected | ▲ UP | 18000 | — | 5 |
| operating_result | ▲ UP | 4200 | 140.0% | 5 |
| cash_runway | ▼ DOWN | -2.5 | -50.0% | 5 |
| active_products | ▲ UP | 2 | — | 5 |
| acceptance_rate | ▼ DOWN | -0.15 | -15.0% | 3 |

## Funnel conversion view
funnel_ref: `revenue_os/funnel_base` (references existing Revenue OS funnel — not redefined)
overall conversion: 0.5%
biggest drop: contacted (78.0%)

| Stage | Count | From top | From prev |
| --- | --- | --- | --- |
| candidates | 1000 | 100.0% | 100.0% |
| contacted | 220 | 22.0% | 22.0% |
| replied | 60 | 6.0% | 27.3% |
| qualified | 24 | 2.4% | 40.0% |
| proposal | 12 | 1.2% | 50.0% |
| won | 5 | 0.5% | 41.7% |

## Cohort retention
blended retention: 77.8% across 3 cohorts

## Anomalies
total: 6 — by severity: {"HIGH":1,"LOW":5}

| Metric | Kind | Severity | Observed | Note |
| --- | --- | --- | --- | --- |
| cash_runway | THRESHOLD_BREACH | HIGH | 2.5 | cash_runway below warning threshold |
| booked_revenue | SPIKE | LOW | 1.5 | booked_revenue rose 150% period-over-period |
| cash_collected | SPIKE | LOW | 1.25 | cash_collected rose 125% period-over-period |
| operating_result | SPIKE | LOW | 0.5313 | operating_result rose 53% period-over-period |
| operating_result | SPIKE | LOW | 2.5 | operating_result rose 250% period-over-period |
| active_products | SPIKE | LOW | 1 | active_products rose 100% period-over-period |
