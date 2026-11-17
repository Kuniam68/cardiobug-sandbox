# Cardiobug Academy — simulated-payment sandbox

Website: https://kuniam68.github.io/cardiobug-sandbox/
Supabase sandbox: `szqiueneqmktiilagbdv`. No live payment adapter exists.

## Student trial

1. Sign in with your existing sandbox student account.
2. Open **TEST — Sandbox Paid Course** from Courses.
3. Open sandbox checkout, choose BDT (৳100.00) or USD ($5.00), and create a dummy order.
4. Choose **Dummy payment — success**. Failed or cancelled outcomes grant no access and offer a fresh dummy order.
5. Open your protected course. Answer its quiz, then mark the lesson complete.
6. Open the Student dashboard to see saved completion and quiz score.

No card/bank details or real money are involved. Your initial purchase and progress are not pre-completed. Successful-order retries are idempotent; prices are read and verified on the server.

## Administration

The existing administrator can use `admin.html` for protected course management and enrollment/progress visibility, and `pricing.html` for sandbox pricing. Preserve the trial course's original content and BDT/USD prices. Other students cannot access the administration RPCs.

## Security and operation

The `payments-sandbox` Edge Function validates bearer tokens with sandbox Auth, checks the tester allowlist and server sandbox switch, constructs/verifies server-only signed dummy receipts, and settles orders through restricted RPCs. It derives a receipt-signing key from built-in server credentials; no privileged credential or receipt key is in frontend code. There is no live-provider toggle.

The progress RPC verifies enrollment and the original quiz answer before saving a score. Direct student progress inserts are disabled. Only the student's own progress and orders are readable through normal student access.

To pause simulation, disable `payment_sandbox_settings.enabled` as owner and turn off the frontend flag. Keep data/history; do not delete users or course data as a stop mechanism. See `supabase/RECOVERY.md`.

Tests: `npm test`; static validation: `npm run check`. Migrations and Edge Function source are under `supabase/`. The older audit document describes the previous checkout-disabled baseline.
