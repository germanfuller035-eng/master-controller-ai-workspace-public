/**
 * lead_import_qa_gate.mjs
 *
 * Standalone QA Gate for the future D1 Lead Intake.
 *
 * Purpose:
 *   Validate the RESULT of a lead import BEFORE the import is considered
 *   successful and allowed to be committed.
 *
 * This module is intentionally:
 *   - pure / standalone (no side effects)
 *   - offline (no network, no Telegram API, no email, no SMTP, no VPS)
 *   - read-only with respect to the workspace (it does not write files)
 *
 * It only inspects an in-memory "import result" object and reports whether
 * the import passes QA.
 *
 * Exports:
 *   - buildLeadImportQaReport
 *   - evaluateLeadImportResult
 *   - validateLeadRecordForQa
 *   - validateImportCounts
 *   - validateDedupeResult
 *   - validateBackupSnapshotRequired
 *   - validateNeedsReviewRows
 *   - validateNoExternalSend
 *   - buildQaGateSummary
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const QA_STATUS = Object.freeze({
  PASS: "PASS",
  PASS_WITH_REVIEW: "PASS_WITH_REVIEW",
  FAIL: "FAIL",
});

export const ALLOWED_LEAD_STATUSES = Object.freeze([
  "new",
  "waiting_approval",
  "needs_review",
  "hold",
  "archived",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function makeIssue(code, message, severity, context) {
  const issue = {
    code,
    message,
    severity, // "blocker" | "warning"
  };
  if (context !== undefined) {
    issue.context = context;
  }
  return issue;
}

function emptyValidation() {
  return {
    ok: true,
    blockers: [],
    warnings: [],
  };
}

function mergeValidation(target, source) {
  if (source.blockers && source.blockers.length) {
    target.blockers.push(...source.blockers);
  }
  if (source.warnings && source.warnings.length) {
    target.warnings.push(...source.warnings);
  }
  target.ok = target.blockers.length === 0;
  return target;
}

// ---------------------------------------------------------------------------
// Rule: backup snapshot required (QA rule 1, 13)
// ---------------------------------------------------------------------------

/**
 * Rule 1 / 13: snapshot_id is mandatory.
 * A missing snapshot_id is a blocker that forces qa_status = FAIL.
 */
export function validateBackupSnapshotRequired(importResult) {
  const result = emptyValidation();
  const snapshotId =
    isPlainObject(importResult) ? importResult.snapshot_id : undefined;

  if (!isNonEmptyString(snapshotId)) {
    result.blockers.push(
      makeIssue(
        "SNAPSHOT_REQUIRED",
        "snapshot_id is required before an import can be committed.",
        "blocker",
        { snapshot_id: snapshotId ?? null }
      )
    );
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Rule: import counts consistency (QA rules 2, 3, 12)
// ---------------------------------------------------------------------------

/**
 * Rule 2: total_rows must be >= parsed_count.
 * Rule 3: added + merged + needs_review + error must not exceed total_rows.
 * Rule 12: error_count > 0 forces FAIL (handled here as a blocker).
 */
export function validateImportCounts(importResult) {
  const result = emptyValidation();

  if (!isPlainObject(importResult)) {
    result.blockers.push(
      makeIssue(
        "COUNTS_INVALID_INPUT",
        "Import result must be an object to validate counts.",
        "blocker"
      )
    );
    result.ok = false;
    return result;
  }

  const totalRows = toFiniteNumber(importResult.total_rows);
  const parsedCount = toFiniteNumber(importResult.parsed_count);
  const addedCount = toFiniteNumber(importResult.added_count) ?? 0;
  const mergedCount = toFiniteNumber(importResult.merged_count) ?? 0;
  const needsReviewCount =
    toFiniteNumber(importResult.needs_review_count) ?? 0;
  const errorCount = toFiniteNumber(importResult.error_count) ?? 0;

  if (totalRows === null) {
    result.blockers.push(
      makeIssue(
        "TOTAL_ROWS_MISSING",
        "total_rows is required and must be a finite number.",
        "blocker"
      )
    );
  }

  if (parsedCount === null) {
    result.blockers.push(
      makeIssue(
        "PARSED_COUNT_MISSING",
        "parsed_count is required and must be a finite number.",
        "blocker"
      )
    );
  }

  // Rule 2
  if (totalRows !== null && parsedCount !== null && totalRows < parsedCount) {
    result.blockers.push(
      makeIssue(
        "TOTAL_LT_PARSED",
        "total_rows must be >= parsed_count.",
        "blocker",
        { total_rows: totalRows, parsed_count: parsedCount }
      )
    );
  }

  // Rule 3
  if (totalRows !== null) {
    const accounted =
      addedCount + mergedCount + needsReviewCount + errorCount;
    if (accounted > totalRows) {
      result.blockers.push(
        makeIssue(
          "COUNTS_EXCEED_TOTAL",
          "added + merged + needs_review + error must not exceed total_rows.",
          "blocker",
          {
            added_count: addedCount,
            merged_count: mergedCount,
            needs_review_count: needsReviewCount,
            error_count: errorCount,
            sum: accounted,
            total_rows: totalRows,
          }
        )
      );
    }
  }

  // Negative values are not allowed.
  const negativeFields = [
    ["added_count", addedCount],
    ["merged_count", mergedCount],
    ["needs_review_count", needsReviewCount],
    ["error_count", errorCount],
  ].filter(([, value]) => value < 0);

  for (const [field, value] of negativeFields) {
    result.blockers.push(
      makeIssue(
        "COUNT_NEGATIVE",
        `${field} must not be negative.`,
        "blocker",
        { field, value }
      )
    );
  }

  // Rule 12: error_count > 0 -> FAIL.
  if (errorCount > 0) {
    result.blockers.push(
      makeIssue(
        "ERRORS_PRESENT",
        "error_count > 0; import cannot be committed.",
        "blocker",
        { error_count: errorCount }
      )
    );
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Rule: dedupe result must be explicit (QA rule 4)
// ---------------------------------------------------------------------------

/**
 * Rule 4: duplicate_count is allowed, but it must be explicitly present.
 * A missing / non-numeric duplicate_count is a blocker because dedupe
 * outcome must always be visible before commit.
 */
export function validateDedupeResult(importResult) {
  const result = emptyValidation();

  if (!isPlainObject(importResult)) {
    result.blockers.push(
      makeIssue(
        "DEDUPE_INVALID_INPUT",
        "Import result must be an object to validate dedupe.",
        "blocker"
      )
    );
    result.ok = false;
    return result;
  }

  const hasField = Object.prototype.hasOwnProperty.call(
    importResult,
    "duplicate_count"
  );
  const duplicateCount = toFiniteNumber(importResult.duplicate_count);

  if (!hasField || duplicateCount === null) {
    result.blockers.push(
      makeIssue(
        "DUPLICATE_COUNT_NOT_REPORTED",
        "duplicate_count must be explicitly reported (a finite number).",
        "blocker",
        { duplicate_count: hasField ? importResult.duplicate_count : null }
      )
    );
  } else if (duplicateCount < 0) {
    result.blockers.push(
      makeIssue(
        "DUPLICATE_COUNT_NEGATIVE",
        "duplicate_count must not be negative.",
        "blocker",
        { duplicate_count: duplicateCount }
      )
    );
  } else if (duplicateCount > 0) {
    result.warnings.push(
      makeIssue(
        "DUPLICATES_FOUND",
        "Duplicates were detected during import.",
        "warning",
        { duplicate_count: duplicateCount }
      )
    );
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Rule: needs_review rows must have a reason (QA rules 5, 14)
// ---------------------------------------------------------------------------

/**
 * Rule 5: every needs_review row must have a reason.
 * Rule 14: needs_review_count > 0 with valid reasons -> PASS_WITH_REVIEW.
 */
export function validateNeedsReviewRows(importResult) {
  const result = emptyValidation();

  if (!isPlainObject(importResult)) {
    result.blockers.push(
      makeIssue(
        "NEEDS_REVIEW_INVALID_INPUT",
        "Import result must be an object to validate needs_review rows.",
        "blocker"
      )
    );
    result.ok = false;
    return result;
  }

  const needsReviewCount =
    toFiniteNumber(importResult.needs_review_count) ?? 0;
  const rows = Array.isArray(importResult.needs_review_rows)
    ? importResult.needs_review_rows
    : [];

  // If a positive count is declared, there must be matching rows.
  if (needsReviewCount > 0 && rows.length === 0) {
    result.blockers.push(
      makeIssue(
        "NEEDS_REVIEW_ROWS_MISSING",
        "needs_review_count > 0 but needs_review_rows are not provided.",
        "blocker",
        { needs_review_count: needsReviewCount }
      )
    );
  }

  // Every provided row must carry a reason.
  rows.forEach((row, index) => {
    const reason = isPlainObject(row) ? row.reason : undefined;
    if (!isNonEmptyString(reason)) {
      result.blockers.push(
        makeIssue(
          "NEEDS_REVIEW_REASON_MISSING",
          "Each needs_review row must include a non-empty reason.",
          "blocker",
          { index }
        )
      );
    }
  });

  if (rows.length > 0 && result.blockers.length === 0) {
    result.warnings.push(
      makeIssue(
        "NEEDS_REVIEW_PRESENT",
        "Some rows require manual review before final acceptance.",
        "warning",
        { needs_review_rows: rows.length }
      )
    );
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Rule: single lead record validity (QA rules 6, 7)
// ---------------------------------------------------------------------------

/**
 * Rule 6: each lead must have at least lead_id OR name OR website.
 * Rule 7: status must be one of the allowed lead statuses.
 */
export function validateLeadRecordForQa(lead, index) {
  const result = emptyValidation();
  const ctxIndex = typeof index === "number" ? index : null;

  if (!isPlainObject(lead)) {
    result.blockers.push(
      makeIssue(
        "LEAD_INVALID_INPUT",
        "Lead record must be an object.",
        "blocker",
        { index: ctxIndex }
      )
    );
    result.ok = false;
    return result;
  }

  // Rule 6
  const hasIdentity =
    isNonEmptyString(lead.lead_id) ||
    isNonEmptyString(lead.name) ||
    isNonEmptyString(lead.website);

  if (!hasIdentity) {
    result.blockers.push(
      makeIssue(
        "LEAD_NO_IDENTITY",
        "Each lead must have at least one of: lead_id, name, website.",
        "blocker",
        { index: ctxIndex }
      )
    );
  }

  // Rule 7
  if (!ALLOWED_LEAD_STATUSES.includes(lead.status)) {
    result.blockers.push(
      makeIssue(
        "LEAD_STATUS_INVALID",
        `Lead status must be one of: ${ALLOWED_LEAD_STATUSES.join(", ")}.`,
        "blocker",
        { index: ctxIndex, status: lead.status ?? null }
      )
    );
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Rule: safety flags (QA rules 8, 9, 10, 11)
// ---------------------------------------------------------------------------

/**
 * Rule 8: safety.network_used === "NO".
 * Rule 9: safety.external_send === "NO".
 * Rule 10: safety.smtp_used === "NO".
 * Rule 11: safety.auto_send === "BLOCKED".
 */
export function validateNoExternalSend(importResult) {
  const result = emptyValidation();
  const safety =
    isPlainObject(importResult) && isPlainObject(importResult.safety)
      ? importResult.safety
      : null;

  if (!safety) {
    result.blockers.push(
      makeIssue(
        "SAFETY_BLOCK_MISSING",
        "safety block is required and must declare offline guarantees.",
        "blocker"
      )
    );
    result.ok = false;
    return result;
  }

  const expectations = [
    ["network_used", "NO", "SAFETY_NETWORK_USED"],
    ["external_send", "NO", "SAFETY_EXTERNAL_SEND"],
    ["smtp_used", "NO", "SAFETY_SMTP_USED"],
    ["auto_send", "BLOCKED", "SAFETY_AUTO_SEND"],
  ];

  for (const [field, expected, code] of expectations) {
    const actual = safety[field];
    if (actual !== expected) {
      result.blockers.push(
        makeIssue(
          code,
          `safety.${field} must be "${expected}".`,
          "blocker",
          { field, expected, actual: actual ?? null }
        )
      );
    }
  }

  result.ok = result.blockers.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Aggregate evaluation
// ---------------------------------------------------------------------------

/**
 * Run every QA rule against the import result and aggregate findings.
 *
 * Returns:
 *   {
 *     blockers: [],
 *     warnings: [],
 *     metrics: {},
 *     hasNeedsReview: boolean
 *   }
 */
export function evaluateLeadImportResult(importResult) {
  const aggregate = emptyValidation();

  // Run rule groups.
  mergeValidation(aggregate, validateBackupSnapshotRequired(importResult));
  mergeValidation(aggregate, validateImportCounts(importResult));
  mergeValidation(aggregate, validateDedupeResult(importResult));
  mergeValidation(aggregate, validateNeedsReviewRows(importResult));
  mergeValidation(aggregate, validateNoExternalSend(importResult));

  // Per-lead validation (QA rules 6, 7).
  const leads =
    isPlainObject(importResult) && Array.isArray(importResult.leads)
      ? importResult.leads
      : [];

  leads.forEach((lead, index) => {
    mergeValidation(aggregate, validateLeadRecordForQa(lead, index));
  });

  // Metrics snapshot.
  const obj = isPlainObject(importResult) ? importResult : {};
  const needsReviewCount = toFiniteNumber(obj.needs_review_count) ?? 0;
  const errorCount = toFiniteNumber(obj.error_count) ?? 0;

  const metrics = {
    snapshot_id: isNonEmptyString(obj.snapshot_id) ? obj.snapshot_id : null,
    total_rows: toFiniteNumber(obj.total_rows),
    parsed_count: toFiniteNumber(obj.parsed_count),
    added_count: toFiniteNumber(obj.added_count) ?? 0,
    merged_count: toFiniteNumber(obj.merged_count) ?? 0,
    duplicate_count: toFiniteNumber(obj.duplicate_count),
    needs_review_count: needsReviewCount,
    error_count: errorCount,
    leads_checked: leads.length,
    blocker_count: aggregate.blockers.length,
    warning_count: aggregate.warnings.length,
  };

  return {
    blockers: aggregate.blockers,
    warnings: aggregate.warnings,
    metrics,
    hasNeedsReview: needsReviewCount > 0,
  };
}

// ---------------------------------------------------------------------------
// Status + summary derivation (QA rules 12-15)
// ---------------------------------------------------------------------------

/**
 * Derive qa_status, can_commit_import and next_action from evaluation.
 *
 * Rule 12: error_count > 0 -> FAIL (surfaced as a blocker).
 * Rule 13: missing snapshot_id -> FAIL (surfaced as a blocker).
 * Rule 14: needs_review_count > 0 with reasons -> PASS_WITH_REVIEW.
 * Rule 15: everything clean -> PASS.
 *
 * can_commit_import:
 *   - true only when qa_status is PASS or PASS_WITH_REVIEW
 *   - false when FAIL
 */
export function buildQaGateSummary(evaluation) {
  const blockers = Array.isArray(evaluation?.blockers)
    ? evaluation.blockers
    : [];
  const warnings = Array.isArray(evaluation?.warnings)
    ? evaluation.warnings
    : [];
  const metrics = isPlainObject(evaluation?.metrics)
    ? evaluation.metrics
    : {};
  const hasNeedsReview = Boolean(evaluation?.hasNeedsReview);

  let qaStatus;
  if (blockers.length > 0) {
    qaStatus = QA_STATUS.FAIL;
  } else if (hasNeedsReview) {
    qaStatus = QA_STATUS.PASS_WITH_REVIEW;
  } else {
    qaStatus = QA_STATUS.PASS;
  }

  const canCommitImport =
    qaStatus === QA_STATUS.PASS || qaStatus === QA_STATUS.PASS_WITH_REVIEW;

  let nextAction;
  if (qaStatus === QA_STATUS.FAIL) {
    nextAction =
      "Resolve all blockers and re-run the QA gate before committing the import.";
  } else if (qaStatus === QA_STATUS.PASS_WITH_REVIEW) {
    nextAction =
      "Commit import is allowed, but route needs_review rows for manual approval.";
  } else {
    nextAction = "Import passed QA and can be committed.";
  }

  return {
    qa_status: qaStatus,
    can_commit_import: canCommitImport,
    blockers,
    warnings,
    metrics,
    next_action: nextAction,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build the full QA report for a lead import result.
 *
 * @param {object} importResult
 * @returns {{
 *   qa_status: string,
 *   can_commit_import: boolean,
 *   blockers: object[],
 *   warnings: object[],
 *   metrics: object,
 *   next_action: string
 * }}
 */
export function buildLeadImportQaReport(importResult) {
  const evaluation = evaluateLeadImportResult(importResult);
  return buildQaGateSummary(evaluation);
}

export default buildLeadImportQaReport;
