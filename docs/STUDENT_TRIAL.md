# Active simulated-payment trial

Target: `szqiueneqmktiilagbdv` / `Kuniam68/cardiobug-sandbox` only.

The existing student can sign in, select TEST — Sandbox Paid Course, create a BDT or USD dummy order, choose success/failure/cancellation, and access the original lesson only after successful settlement. A correct quiz plus Complete lesson saves a server-validated score and updates dashboard completion/history. The administrator can load private course content without overwriting placeholders and see enrollments/progress.

## What changed

- Deployed `payments-sandbox` Edge Function with per-request sandbox Auth validation, exact sandbox identity, approved-origin CORS, tester allowlist and server switch checks.
- Receipt signing derives a server-only key from the sandbox runtime secret; no custom key installation or frontend secret is required. Providers are simulation-only and no live gateway is selected.
- Enabled only the sandbox database/frontend simulation switches and added the existing verified administrator to the tester allowlist for administration. Existing student/admin roles and credentials are preserved.
- Added two nullable score fields and RPCs for enrollment-checked quiz completion and admin-only enrollment visibility. Direct student progress inserts are revoked in favor of server verification. Existing bundled free lessons remain supported.
- Added recoverable/idempotent checkout UI, immutable exact amounts, order refresh/resume, terminal-state handling, payment history, server-scored completion and dashboard scores.
- Versioned frontend modules/styles avoid stale mixed deployments.

## Verification

- 82 local tests passed, including payment handlers, currencies, receipt tampering, access checks, completion and previous regressions.
- 11 local PostgreSQL fixture checks passed for the additive scoring migration, correct/wrong answers, duplicate completion, invalid lessons/answers, admin visibility, free compatibility and direct-write denial.
- Hosted rollback-only transaction exercised BDT amount/idempotency/failure, USD cancellation/success, mismatched receipts, duplicate success, automatic enrollment, original lesson retrieval, wrong/correct quiz answers, duplicate progress, admin overview and denial to the existing non-enrolled student. Every test order/event/enrollment/progress row rolled back; the student's actual purchase/progress were never completed.
- Browser acceptance used real frontend modules and actual handler/provider code with isolated Auth/Data/Edge fixtures. Desktop BDT and mobile USD journeys passed, including failure/cancellation/retry, refresh without duplicate orders, protected access, quiz, completion, dashboard score/history and admin private editor/enrollment visibility. No real passwords or tokens were requested.
- Live endpoint checks verified deployment, CORS and rejection of anonymous access; new RPCs are registered and reject anonymous callers. Deployed-static browser acceptance repeats the fixture journey after publication.

## Important verification boundary

No authorized authenticated session is available for an independent live HTTP purchase. A proposed temporary credential-management audit endpoint was rejected by automatic approval review; it was not deployed, no accounts were created, and its unused local credentials/source were removed. Testing continued with isolated browser fixtures and actual rollback-only database scenarios. These are not represented as a real signed-in backend purchase.

The existing student is left without orders, enrollment or progress for the final live trial. No original content or prices were changed. The course remains paid/published/unarchived, original payload fingerprint `becc28e47cc0ce45bf4f7a621331d9f8`, BDT10000/USD500 revision1. No live payments or production access occurred.

Historical audit findings remain applicable: intentional authenticated SECURITY DEFINER RPCs, deny-by-default private tables and leaked-password protection requiring a Dashboard configuration review. The two new RPCs use empty search paths, explicit authenticated-only execution and caller authorization checks. See RECOVERY.md to stop simulation without deleting data.
