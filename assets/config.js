// Public configuration only. NEVER place a service-role key, password, or other secret here.
export const config = Object.freeze({
  // Development feature flag. Keep disabled until an isolated sandbox is approved.
  paymentSandboxEnabled: false,
  academyName: 'Cardiobug',
  supabaseUrl: 'https://szqiueneqmktiilagbdv.supabase.co',
  supabasePublishableKey: 'sb_publishable_zLXxQzk--pI-R4m4th9SVg_oG7JUFE4',
  contactEmail: '',
  // Enable only after the Google provider is configured in Supabase.
  googleSignIn: false,
  turnstileSiteKey: '0x4AAAAAAGEOAgSqIGZqRx5x',
  // off: no widget; optional: show/send tokens when available; required: require a token.
  // Leave optional until Supabase CAPTCHA enforcement is enabled and tested.
  turnstileMode: 'optional'
});

// Fail closed if this testing site is ever misconfigured.
if (config.supabaseUrl !== 'https://szqiueneqmktiilagbdv.supabase.co' || config.paymentSandboxEnabled !== false) throw new Error('Sandbox configuration rejected.');
