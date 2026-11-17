# Cardiobug Academy sandbox

Static testing frontend for https://kuniam68.github.io/cardiobug-sandbox/

Uses ONLY Supabase project `szqiueneqmktiilagbdv`. The public publishable key is intentionally public; authorization is enforced by sandbox RLS. No privileged credentials are included. Checkout and payments are disabled.

GitHub Pages: deploy `main` from `/ (root)`. No build or paid hosting is required.

Before authentication email testing, configure sandbox Auth Site URL as `https://kuniam68.github.io/cardiobug-sandbox/` and exact redirect URLs `https://kuniam68.github.io/cardiobug-sandbox/signin.html` and `https://kuniam68.github.io/cardiobug-sandbox/reset-password.html`. Those settings have NOT been changed by this deployment.

Turnstile remains optional. Verify its allowed hostname includes `kuniam68.github.io` before testing the widget. No test accounts have been created. Do not use real student credentials on this site.
