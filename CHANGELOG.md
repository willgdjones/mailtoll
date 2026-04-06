# Changelog

## 2026-04-06

### Add PostHog analytics
- Added PostHog snippet to landing page and settings page
- Tracks pageviews and identified users

### Remove Gmail API permissions
- OAuth now only requests `openid`, `email`, `profile` — no more `gmail.modify` or `gmail.labels`
- Landing page updated: "Connect your Gmail" → "Sign in with Google"
- Removed Gmail-specific language from feature descriptions

### End-to-end delivery verified
- Full pipeline working: registry → 402 → whitelist bypass → queue → Resend delivery
- Test email delivered to `will@perihelion.limited` via `noreply@mailtoll.app`

### Switch to Resend for email delivery
- Replaced Gmail API injection with Resend REST API
- No longer requires Gmail OAuth tokens or Gmail API enabled in Google Cloud
- Emails sent from `noreply@mailtoll.app` with verified SPF/DKIM/DMARC
- Domain `mailtoll.app` verified on Resend

### Make delivery worker poll continuously
- Worker now runs in a persistent loop polling every 10 seconds
- Previously ran once and exited, missing any emails queued after startup

### Configure Railway production environment
- Set all environment variables on `mailtoll` and `worker` services
- Switched `DATABASE_URL` to Supabase connection pooler (IPv4) to fix `ENETUNREACH` on Railway
- Updated `.env` with correct Supabase JWT keys and Google OAuth credentials

## 2026-03-06

### Initial commit
- Express.js API with Supabase backend
- Google OAuth recipient onboarding
- Public registry endpoint for agent discovery
- 402 payment-required flow with 4 rails: Stripe, Coinbase Commerce, stablecoin (USDC), x402
- Payment verification and replay prevention
- Email queueing and delivery worker with retry logic
- Recipient settings UI (price, accepted rails, whitelist, wallet address)
- x402 payment support with Coinbase CDP facilitator
- Jest test setup with API tests
- Test agent script for end-to-end x402 flow
