# Changelog

## 2026-04-05

### Editorial restyle (impeccable design pass)
- Rewrote `public/styles.css` with a refined editorial aesthetic: Fraunces serif display, Inter body, warm paper background with soft radial washes, ink/gold palette via OKLCH
- Wordmark header injected on every page via `.container::before`
- Numbered editorial feature list (replaces uniform card grid)
- Stats grid restyled as large serif figures with vertical rule
- Payment-rail checkboxes restyled as toggle pills with `:has()` selector
- Form inputs get gold focus ring; buttons gain subtle lift on hover
- Respects `prefers-reduced-motion`; mobile breakpoint at 540px

## 2026-04-06

### Fix OAuth redirect + custom handle selection
- Fixed OAuth redirect to use `mailtoll.app` instead of `mailtoll-production.up.railway.app`
- Users can now choose their own handle during signup (welcome page)
- Handle editable in settings with real-time availability check
- Handle validation: 3-30 chars, lowercase alphanumeric, hyphens/underscores, no reserved words
- Auto-generated handles skip reserved words (route paths)

### Profile pages: bio and social links
- Added bio, X (Twitter) URL, and LinkedIn URL fields to recipient profiles
- New fields editable from settings page
- Public profile pages display bio and linked social accounts

### Pre-launch improvements
- Error/404 pages — proper HTML pages instead of raw JSON for browser requests
- Fixed signup flow — removed Gmail token storage since we use Resend now
- Input validation on /schedule — email format, subject/body length limits
- Rate limiting — 60 req/min on registry, 20 req/min on schedule/pay
- Welcome page — new users see onboarding flow before settings
- Public profile pages — `mailtoll.app/:handle` shows pricing and payment info for agents
- Email notifications — recipients get notified when a paid email is delivered
- Earnings dashboard — settings page shows total emails received and earnings
- Favicon ($ symbol) and OpenGraph meta tags for link previews on social media

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
