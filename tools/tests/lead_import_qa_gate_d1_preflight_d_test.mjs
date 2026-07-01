/**
 * lead_import_qa_gate_d1_preflight_d_test.mjs
 *
 * Standalone offline test for tools/telegram_gateway/lead_import_qa_gate.mjs
 *
 * Safety:
 *   - No network, no Telegram API, no email, no SMTP, no VPS.
 *   - Reads no .env and no AI_SECRETS.
 *   - Pure in-memory assertions only.
 *
 * Run:
 *   node --check tools/tests/lead_import_qa_gate_d1_preflight_d_test.mjs
 *   node tools/tests/lead_import_qa_gate_d1_preflight_d_test.mjs
 */

import {
  buildLeadImportQaReport,
  buildQaGateSummary,
  evaluateLeadImportResult,
  QA_STATUS,
} from "../telegram_gateway/lead_import_qa_gate.mjs";

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validLead(overrides = {}) {
  return {
    lead_id: "lead-001",
    name: "Acme Steel",
    website: "https://acme.example",
    status: "new",
    ...overrides,
  };
}

function validSafety(overrides = {}) {
  return {
    network_used: "NO",
    external_send: "NO",
    smtp_used: "NO",
    auto_send: "BLOCKED",
    ...overrides,
  };
}

/**
 * A clean import result that should PASS.
 */
function validImportResult(overrides = {}) {
  return {
    snapshot_id: "snap-2026-06-03-0001",
    total_rows: 3,
    parsed_count: 3,
    added_count: 2,
    merged_count: 1,
    duplicate_count: 0,
    needs_review_count: 0,
    error_count: 0,
    needs_review_rows: [],
    leads: [validLead(), validLead({ lead_id: "lead-002" })],
    safety: validSafety(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: PASS for a clean result
// ---------------------------------------------------------------------------

console.log("Scenario 1: clean result -> PASS");
{
  const report = buildLeadImportQaReport(validImportResult());
  check("1.qa_status === PASS", report.qa_status === QA_STATUS.PASS);
  check("1.can_commit_import === true", report.can_commit_import === true);
  check("1.no blockers", report.blockers.length === 0);
  check("1.error_count metric is 0", report.metrics.error_count === 0);
  check("1.needs_review_count metric is 0", report.metrics.needs_review_count === 0);
}

// ---------------------------------------------------------------------------
// Scenario 2: FAIL when snapshot_id missing
// ---------------------------------------------------------------------------

console.log("Scenario 2: missing snapshot_id -> FAIL");
{
  const r = validImportResult();
  delete r.snapshot_id;
  const report = buildLeadImportQaReport(r);
  check("2.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check("2.can_commit_import === false", report.can_commit_import === false);
  check(
    "2.SNAPSHOT_REQUIRED blocker present",
    report.blockers.some((b) => b.code === "SNAPSHOT_REQUIRED")
  );
}

// ---------------------------------------------------------------------------
// Scenario 3: FAIL when total_rows < parsed_count
// ---------------------------------------------------------------------------

console.log("Scenario 3: total_rows < parsed_count -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({ total_rows: 2, parsed_count: 3 })
  );
  check("3.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "3.TOTAL_LT_PARSED blocker present",
    report.blockers.some((b) => b.code === "TOTAL_LT_PARSED")
  );
}

// ---------------------------------------------------------------------------
// Scenario 4: FAIL when added + merged + needs_review + error > total_rows
// ---------------------------------------------------------------------------

console.log("Scenario 4: counts exceed total_rows -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      total_rows: 3,
      parsed_count: 3,
      added_count: 3,
      merged_count: 2,
      needs_review_count: 0,
      error_count: 0,
    })
  );
  check("4.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "4.COUNTS_EXCEED_TOTAL blocker present",
    report.blockers.some((b) => b.code === "COUNTS_EXCEED_TOTAL")
  );
}

// ---------------------------------------------------------------------------
// Scenario 5: FAIL when a lead has no lead_id/name/website
// ---------------------------------------------------------------------------

console.log("Scenario 5: lead without identity -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      leads: [{ status: "new" }],
    })
  );
  check("5.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "5.LEAD_NO_IDENTITY blocker present",
    report.blockers.some((b) => b.code === "LEAD_NO_IDENTITY")
  );
}

// ---------------------------------------------------------------------------
// Scenario 6: FAIL when lead.status is invalid
// ---------------------------------------------------------------------------

console.log("Scenario 6: invalid lead.status -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      leads: [validLead({ status: "exploded" })],
    })
  );
  check("6.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "6.LEAD_STATUS_INVALID blocker present",
    report.blockers.some((b) => b.code === "LEAD_STATUS_INVALID")
  );
}

// ---------------------------------------------------------------------------
// Scenario 7: FAIL when safety.network_used !== "NO"
// ---------------------------------------------------------------------------

console.log("Scenario 7: safety.network_used !== NO -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({ safety: validSafety({ network_used: "YES" }) })
  );
  check("7.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "7.SAFETY_NETWORK_USED blocker present",
    report.blockers.some((b) => b.code === "SAFETY_NETWORK_USED")
  );
}

// ---------------------------------------------------------------------------
// Scenario 8: FAIL when safety.external_send !== "NO"
// ---------------------------------------------------------------------------

console.log("Scenario 8: safety.external_send !== NO -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({ safety: validSafety({ external_send: "YES" }) })
  );
  check("8.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "8.SAFETY_EXTERNAL_SEND blocker present",
    report.blockers.some((b) => b.code === "SAFETY_EXTERNAL_SEND")
  );
}

// ---------------------------------------------------------------------------
// Scenario 9: FAIL when safety.smtp_used !== "NO"
// ---------------------------------------------------------------------------

console.log("Scenario 9: safety.smtp_used !== NO -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({ safety: validSafety({ smtp_used: "YES" }) })
  );
  check("9.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "9.SAFETY_SMTP_USED blocker present",
    report.blockers.some((b) => b.code === "SAFETY_SMTP_USED")
  );
}

// ---------------------------------------------------------------------------
// Scenario 10: FAIL when safety.auto_send !== "BLOCKED"
// ---------------------------------------------------------------------------

console.log("Scenario 10: safety.auto_send !== BLOCKED -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({ safety: validSafety({ auto_send: "ALLOWED" }) })
  );
  check("10.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "10.SAFETY_AUTO_SEND blocker present",
    report.blockers.some((b) => b.code === "SAFETY_AUTO_SEND")
  );
}

// ---------------------------------------------------------------------------
// Scenario 11: FAIL when error_count > 0
// ---------------------------------------------------------------------------

console.log("Scenario 11: error_count > 0 -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      total_rows: 3,
      parsed_count: 3,
      added_count: 1,
      merged_count: 1,
      error_count: 1,
    })
  );
  check("11.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "11.ERRORS_PRESENT blocker present",
    report.blockers.some((b) => b.code === "ERRORS_PRESENT")
  );
}

// ---------------------------------------------------------------------------
// Scenario 12: PASS_WITH_REVIEW when needs_review_count > 0 with reasons
// ---------------------------------------------------------------------------

console.log("Scenario 12: needs_review with reasons -> PASS_WITH_REVIEW");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      total_rows: 3,
      parsed_count: 3,
      added_count: 1,
      merged_count: 0,
      needs_review_count: 2,
      needs_review_rows: [
        { reason: "missing contact email" },
        { reason: "ambiguous company name" },
      ],
    })
  );
  check(
    "12.qa_status === PASS_WITH_REVIEW",
    report.qa_status === QA_STATUS.PASS_WITH_REVIEW
  );
  check("12.can_commit_import === true", report.can_commit_import === true);
  check("12.no blockers", report.blockers.length === 0);
}

// ---------------------------------------------------------------------------
// Scenario 13: FAIL when needs_review_count > 0 but reason missing
// ---------------------------------------------------------------------------

console.log("Scenario 13: needs_review without reason -> FAIL");
{
  const report = buildLeadImportQaReport(
    validImportResult({
      total_rows: 3,
      parsed_count: 3,
      added_count: 1,
      merged_count: 0,
      needs_review_count: 1,
      needs_review_rows: [{ note: "no reason given" }],
    })
  );
  check("13.qa_status === FAIL", report.qa_status === QA_STATUS.FAIL);
  check(
    "13.NEEDS_REVIEW_REASON_MISSING blocker present",
    report.blockers.some((b) => b.code === "NEEDS_REVIEW_REASON_MISSING")
  );
}

// ---------------------------------------------------------------------------
// Scenario 14: duplicate_count allowed, surfaces as warning/metric
// ---------------------------------------------------------------------------

console.log("Scenario 14: duplicate_count allowed -> warning + metric");
{
  const report = buildLeadImportQaReport(
    validImportResult({ duplicate_count: 2 })
  );
  check("14.qa_status === PASS", report.qa_status === QA_STATUS.PASS);
  check("14.can_commit_import === true", report.can_commit_import === true);
  check(
    "14.DUPLICATES_FOUND warning present",
    report.warnings.some((w) => w.code === "DUPLICATES_FOUND")
  );
  check("14.duplicate_count metric === 2", report.metrics.duplicate_count === 2);
}

// ---------------------------------------------------------------------------
// Scenario 15: can_commit_import = true only for PASS / PASS_WITH_REVIEW
// ---------------------------------------------------------------------------

console.log("Scenario 15: can_commit_import true only on PASS/PASS_WITH_REVIEW");
{
  const passReport = buildLeadImportQaReport(validImportResult());
  const reviewReport = buildLeadImportQaReport(
    validImportResult({
      total_rows: 3,
      parsed_count: 3,
      added_count: 1,
      merged_count: 0,
      needs_review_count: 1,
      needs_review_rows: [{ reason: "verify phone" }],
    })
  );
  check(
    "15.PASS -> can_commit true",
    passReport.qa_status === QA_STATUS.PASS &&
      passReport.can_commit_import === true
  );
  check(
    "15.PASS_WITH_REVIEW -> can_commit true",
    reviewReport.qa_status === QA_STATUS.PASS_WITH_REVIEW &&
      reviewReport.can_commit_import === true
  );
}

// ---------------------------------------------------------------------------
// Scenario 16: can_commit_import = false on FAIL
// ---------------------------------------------------------------------------

console.log("Scenario 16: FAIL -> can_commit_import false");
{
  const r = validImportResult();
  delete r.snapshot_id;
  const report = buildLeadImportQaReport(r);
  check(
    "16.FAIL -> can_commit false",
    report.qa_status === QA_STATUS.FAIL &&
      report.can_commit_import === false
  );
}

// ---------------------------------------------------------------------------
// Scenario 17: buildQaGateSummary returns the expected shape
// ---------------------------------------------------------------------------

console.log("Scenario 17: buildQaGateSummary shape");
{
  const evaluation = evaluateLeadImportResult(validImportResult());
  const summary = buildQaGateSummary(evaluation);
  check("17.has qa_status", typeof summary.qa_status === "string");
  check(
    "17.has can_commit_import",
    typeof summary.can_commit_import === "boolean"
  );
  check("17.has blockers array", Array.isArray(summary.blockers));
  check("17.has warnings array", Array.isArray(summary.warnings));
  check(
    "17.has metrics object",
    summary.metrics !== null && typeof summary.metrics === "object"
  );
  check("17.has next_action", typeof summary.next_action === "string");
}

// ---------------------------------------------------------------------------
// Scenario 18: no network / SMTP / external send / .env / AI_SECRETS patterns
// ---------------------------------------------------------------------------

console.log("Scenario 18: static safety scan of this test source");
{
  // Read this test's own source synchronously without network access.
  // import.meta.url is a file:// URL; convert to a path for fs.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const selfPath = fileURLToPath(import.meta.url);
  const source = readFileSync(selfPath, "utf8");

  // Only scan the code BEFORE this scanner block. The scanner itself must
  // name the forbidden tokens in order to detect them, so it is excluded
  // via a sentinel marker that is assembled from fragments at runtime.
  const sentinel = "SCANNER" + "_REGION_START";
  const cutIndex = source.indexOf(sentinel);
  const region = cutIndex >= 0 ? source.slice(0, cutIndex) : source;

  // Strip comment lines so that documentation that merely mentions these
  // words (e.g. the file header) does not trigger a false positive. We only
  // care about real capability usage in executable code.
  const scanned = region
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith("*")) return false;
      if (t.startsWith("/*")) return false;
      if (t.startsWith("//")) return false;
      return true;
    })
    .join("\n");

  // Forbidden capability tokens, assembled from fragments so this list does
  // not match itself once the scanner region is (correctly) excluded. These
  // are deliberately specific (real network/SMTP/secret usage) so they do not
  // collide with legitimate data field names such as `smtp_used`,
  // `network_used`, `external_send` or `auto_send`.
  const forbidden = [
    "fe" + "tch(",
    "ax" + "ios",
    "node:" + "http",
    "node:" + "net",
    "node:" + "tls",
    "node:" + "dgram",
    "node" + "mailer",
    "create" + "Transport",
    "sm" + "tp://",
    "Web" + "Socket",
    "process." + "env",
    "AI_" + "SECRETS",
    "Telegram" + "Bot",
  ];

  let cleanCount = 0;
  for (const token of forbidden) {
    if (!scanned.includes(token)) {
      cleanCount += 1;
    }
  }
  check(
    "18.no forbidden network/SMTP/secret patterns in active code",
    cleanCount === forbidden.length
  );
}
// SCANNER_REGION_START (sentinel; nothing below here is scanned by rule 18)

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n========================================");
console.log(`TOTAL: ${passed + failed}  PASSED: ${passed}  FAILED: ${failed}`);
if (failed > 0) {
  console.log("FAILED TESTS:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  console.log("========================================");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED");
  console.log("========================================");
  process.exit(0);
}
