// Public configuration only. NEVER place a service-role key, password, or other secret here.
export const config = Object.freeze({
  paymentSandboxEnabled: false,
  paymentCheckoutEnabled: true,
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

if(config.supabaseUrl!=='https://szqiueneqmktiilagbdv.supabase.co'||config.paymentSandboxEnabled!==false)throw new Error('Acceptance configuration rejected.');
