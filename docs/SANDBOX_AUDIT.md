# Cardiobug sandbox audit — 2026-11-17

Scope: `Kuniam68/cardiobug-sandbox`, Supabase `szqiueneqmktiilagbdv` only. Production services were not accessed. Checkout remains disabled; payment functions were not deployed.

## Fixed and regression-tested

- All 21 social-preview image URLs now use the sandbox path. Removed the duplicate recovery-page robots directive.
- Sign-in, an email token landing page, now sends no referrers, matching recovery-page privacy protection.
- Escape closes expanded mobile navigation and returns focus to its toggle.
- Authentication and informational pages no longer await unrelated course/classification/price reads. Learning pages retain authoritative access checks and read-only price retrieval.
- Added sandbox configuration, metadata isolation, callback privacy, redirect, keyboard, CAPTCHA, and initialization tests. Brought existing recovery, route and course-validation regression tests into this repository.

## Results before deployment

- Sandbox: 71 test cases passed; 0 failed; 0 skipped.
- Reviewed local payment implementation: 60 cases passed; 0 failed; 0 skipped. This includes local database fixtures for restrictive/permissive grants, transaction rollback, paid content isolation, immutable order amounts, currencies, receipt tampering, replay and sandbox restrictions. Payment scenarios run only in local fixtures, never as hosted orders.
- Static validation: 21 HTML pages passed local file, link, anchor, duplicate-ID and manifest checks.
- Headless Chromium: 16 routes at 1280px and 390px, 32 cases passed against the fixed local frontend using sandbox anonymous reads. No page JavaScript errors, horizontal overflow, failed UI checks, or axe-core 4.11.0 WCAG A/AA findings in the tested top-level documents.
- Browser checks cover both course prices, locked lesson URLs, disabled checkout, anonymous administrator gating and mobile Escape navigation.
- Chromium needed a test-context certificate override for the execution environment's certificate trust issue; the website's TLS/application configuration was not changed. Python HTTPS checks retained ordinary certificate verification. CAPTCHA cross-origin frames were excluded from axe scans; CAPTCHA token behavior is covered by local mocked tests.
- Initial browser harness failures (certificate trust, restricted local-server socket, and third-party frame interference) were corrected before the passing run. These are not application test successes.

## Hosted authorization and integrity

The owner authorized a one-time enrollment inside an explicit transaction ending in ROLLBACK. Strict preconditions required the expected lesson fingerprint, disabled checkout and zero baseline access/payment records. No custom enrollment/progress triggers were present.

- Before insertion: student paid self-enrollment, private-content retrieval, course save and archive actions were denied. Spoofed user metadata did not confer administrator status.
- With the temporary enrollment: explicit student role/UUID assertions passed; access became true and protected retrieval matched the original fingerprint. Direct private-table access remained denied.
- A synthetic non-enrolled role/UUID context could not see the student's enrollment or retrieve its lesson; this was a database simulation, not an Auth account or browser session.
- Anonymous private access remained denied.
- The transaction rolled back. Independent reads confirmed zero enrollments, progress, orders and payment events.
- The existing administrator's read-only retrieval still matched the original payload.
- All 13 public tables have RLS; administrator membership mutations and settlement RPC execution are unavailable to students. No SECURITY DEFINER function has blanket PUBLIC EXECUTE grants.

Original lesson fingerprint: `becc28e47cc0ce45bf4f7a621331d9f8`. The course remains published, paid and unarchived, with sanitized metadata and prices BDT 10000 / USD 500, revision 1. No persistent database data, functions, policies, permissions, account credentials or SMTP settings were changed in this cycle.

## Advisor findings and disposition

Security: 10 warning findings and 4 informational findings remain.

- Anonymous SECURITY DEFINER execution (2): `course_is_available`, `payment_course_is_paid`. These intentionally return course-state booleans used by catalog policies/classification.
- Authenticated SECURITY DEFINER execution (7): the same two functions plus `is_academy_admin`, `archive_academy_course`, `save_academy_course`, `payment_has_access`, `payment_get_content`. Existing callers require them. Admin writes enforce membership; private content enforces admin or published-course enrollment. Privileged helpers/settlement remain inaccessible to students. Empty search paths and explicit grants were inspected; blanket revocation would break supported callers. These warnings are reviewed, not removed or represented as resolved.
- RLS without client policies (4 INFO): `payment_course_content`, `payment_events`, `payment_sandbox_settings`, `payment_test_accounts`. Intentional client denial; no permissive policies were added to silence advisories.
- Leaked-password protection disabled (1 WARN): outstanding Auth hardening. Enabling requires Dashboard/authorized Auth configuration access and plan availability; this integration does not expose Auth settings management. Email registration/confirmation remain enabled/required and anonymous sign-in is disabled. No passwords or SMTP secrets were changed.

Performance: three overlapping permissive SELECT-policy warnings (academy_courses, payment_course_settings, payment_prices) and one unused payment-history index INFO. Policies intentionally combine public and administrator reads; the index serves future order-history queries on a currently empty table. No evidence justified dropping it or changing access policy semantics.

Health: no findings.

References: [anonymous definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [overlapping policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies), [unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Limits and review readiness

No passwords/session tokens were requested or captured. Actual authenticated browser login/email delivery/recovery for existing accounts was not rerun. The user previously reported a successful administrator browser load. No persistent enrollment was created for an enrolled-student browser test. No hosted checkout/payment test was run; hosted checkout remains disabled and live gateway capabilities are unverified.

This package is suitable for a controlled production-integration review, not production deployment or live-payment approval. Remaining work includes Auth hardening/configuration review, real authenticated browser acceptance, and a separately reviewed payment-backend/gateway integration. This audit does not establish 100% security, accessibility or performance.
