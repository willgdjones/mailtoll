# Priority Inbox — PRD & Tech Spec

## Overview

Priority Inbox is a protocol and service that enables GTM agents to discover, pay, and reliably deliver messages to human recipients. Recipients connect their existing Gmail account and receive a machine-readable endpoint that guarantees delivery with a priority flag in exchange for a micropayment. The platform takes a cut of each transaction; the remainder goes to the recipient.

---

## Product Requirements Document (PRD)

### Problem

Email is a black hole for programmatic outreach. There is no machine-readable signal that tells a GTM agent: "this person accepts cold contact, under these conditions, at this price." Cold email delivery is unreliable, noisy, and increasingly filtered. Agents have no trusted channel for human reachability.

### Solution

A registry of human endpoints. Each registered recipient gets a URL that any GTM agent can:

1. Query to discover pricing, accepted payment rails, and contact preferences
2. Pay a micropayment via a supported rail
3. Submit a message that is guaranteed to arrive in the recipient's inbox with a priority label

Recipients never change their email address. They connect Gmail via OAuth and the platform injects priority-labelled emails via the Gmail API.

### Primary Customer

GTM agents — automated outreach systems that need a reliable, programmatic channel to reach specific humans. The product is agent-native by design: endpoints are machine-readable, payments are programmatic, the entire flow requires no human on the sender side.

### Secondary Customer

Recipients — professionals who want to monetise inbound attention and filter noise. High-value individuals (executives, domain experts, popular creators) earn more because senders are willing to pay more to reach them.

### Core User Flows

**Recipient onboarding:**
1. Sign in with Google via Supabase Auth
2. Grant Gmail API permissions (read + insert/label)
3. Platform creates a registry entry and generates a public endpoint URL (e.g. `priorityinbox.com/will`)
4. Recipient customises: price per message, accepted payment rails, whitelisted senders, category preferences

**GTM agent sending flow:**
1. Agent queries `GET /registry/:handle` — receives pricing, accepted rails, endpoint URL
2. Agent hits `POST /schedule` — receives `402 Payment Required` with payment details
3. Agent pays via chosen rail (Stripe, Coinbase, stablecoin, X402)
4. Agent re-hits `POST /schedule` with payment proof token
5. Server verifies payment, queues email
6. Cron job fires Gmail API to inject email with priority label into recipient's inbox

**Normal email:**
Unaffected. Recipients keep their existing Gmail address and client. Priority emails appear in a dedicated Gmail label alongside normal mail.

### What the Platform Does Not Do

- Replace email. Normal email continues to work as-is.
- Require senders to have a platform account. Any agent can pay and send.
- Handle email hosting or routing. The platform is a layer on top of Gmail.

### Monetisation

Platform takes a percentage cut of each micropayment transaction. Remainder goes to recipient. Pricing tiers and exact cut TBD.

### Non-Goals (v1)

- Per-person variable pricing (fixed platform pricing in v1)
- Payout / withdrawal infrastructure (recipients accumulate balance; payouts in v2)
- Support for email providers other than Gmail (Outlook in v2)
- Mobile app

---

## Technical Specification

### Stack

| Layer | Technology |
|---|---|
| API server | Node.js (TypeScript) |
| Framework | Fastify or Express |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (Google OAuth) |
| Deployment | Railway (web service + cron service) |
| Gmail integration | Google Gmail API v1 |
| Payment rails | Stripe, Coinbase Commerce, stablecoin (USDC via RPC node), X402 |

---

### Database Schema

```sql
-- Recipients registered on the platform
CREATE TABLE recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  handle TEXT UNIQUE NOT NULL,           -- public endpoint slug e.g. "will"
  gmail_access_token TEXT NOT NULL,
  gmail_refresh_token TEXT NOT NULL,
  price_usd NUMERIC(10, 4) NOT NULL DEFAULT 1.00,
  accepted_rails TEXT[] NOT NULL DEFAULT '{stripe,coinbase,stablecoin,x402}',
  whitelist TEXT[],                      -- email addresses bypassing payment
  category_preferences TEXT,            -- free text shown to senders
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Used payment proofs to prevent replay attacks
CREATE TABLE payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_hash TEXT UNIQUE NOT NULL,       -- hashed token/tx hash
  rail TEXT NOT NULL,
  recipient_id UUID REFERENCES recipients(id),
  amount_usd NUMERIC(10, 4),
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emails queued for delivery
CREATE TABLE scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES recipients(id),
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  payment_proof_id UUID REFERENCES payment_proofs(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  retry_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery receipts
CREATE TABLE delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_email_id UUID REFERENCES scheduled_emails(id),
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  gmail_message_id TEXT
);
```

---

### API Endpoints

#### `GET /registry/:handle`

Public. No auth required. Called by GTM agents to discover endpoint and pricing.

**Response:**
```json
{
  "handle": "will",
  "endpoint": "https://priorityinbox.com/schedule",
  "price_usd": 1.00,
  "accepted_rails": ["stripe", "coinbase", "stablecoin", "x402"],
  "category_preferences": "Open to engineering roles and AI tooling partnerships"
}
```

---

#### `POST /schedule`

Called by GTM agents to submit a message. Two-phase: first call returns 402, second call with payment proof delivers.

**Request body:**
```json
{
  "handle": "will",
  "sender_email": "agent@gtmtool.com",
  "subject": "Senior AI Engineer opportunity",
  "body": "...",
  "payment_proof": {
    "rail": "stripe",
    "proof": "pi_3PxYZ..."
  }
}
```

**First call (no payment_proof):**
Returns `402 Payment Required`:
```json
{
  "error": "payment_required",
  "amount_usd": 1.00,
  "accepted_rails": ["stripe", "coinbase", "stablecoin", "x402"],
  "payment_instructions": {
    "stripe": "https://priorityinbox.com/pay/stripe?handle=will",
    "coinbase": "https://priorityinbox.com/pay/coinbase?handle=will",
    "x402": { "paymentRequired": true, "maxAmountRequired": "1.00", "asset": "USDC" }
  },
  "expires_at": "2026-03-06T12:05:00Z"
}
```

**Second call (with valid payment_proof):**
Returns `201 Created`:
```json
{
  "scheduled_email_id": "uuid",
  "status": "queued"
}
```

---

#### `GET /auth/google` and `GET /auth/google/callback`

Handled by Supabase Auth. Standard Google OAuth flow for recipient onboarding. On callback, platform creates or updates recipient record and stores Gmail tokens.

---

#### `PATCH /settings`

Authenticated. Recipient updates their registry entry.

**Request body (all fields optional):**
```json
{
  "price_usd": 2.00,
  "accepted_rails": ["stripe", "x402"],
  "whitelist": ["partner@company.com"],
  "category_preferences": "AI tooling and climate tech only"
}
```

---

### Payment Verification Module

A single function called before any email is queued. Branches per rail, returns a boolean.

```typescript
async function verifyPayment(proof: {
  rail: 'stripe' | 'coinbase' | 'stablecoin' | 'x402',
  proof: string,
  expected_amount_usd: number,
  recipient_id: string
}): Promise<boolean> {
  // 1. Check proof_hash not already in payment_proofs (replay prevention)
  // 2. Branch per rail:
  //    stripe    → call Stripe API, verify payment_intent status === 'succeeded' and amount matches
  //    coinbase  → call Coinbase Commerce API, verify charge status === 'CONFIRMED' and amount matches
  //    stablecoin → query RPC node (Alchemy/Infura), verify tx confirmed and USDC amount matches recipient address
  //    x402      → verify cryptographic signature on token, check expiry
  // 3. If valid, insert proof_hash into payment_proofs
  // 4. Return true/false
}
```

---

### Cron Job (Delivery Worker)

Runs every minute via Railway's cron service. Picks up pending emails and fires Gmail API.

```typescript
async function deliveryWorker() {
  // Acquire rows with SKIP LOCKED to prevent double delivery
  const emails = await db.query(`
    SELECT * FROM scheduled_emails
    WHERE status = 'pending'
    AND next_attempt_at <= NOW()
    FOR UPDATE SKIP LOCKED
    LIMIT 10
  `);

  for (const email of emails) {
    try {
      const recipient = await getRecipient(email.recipient_id);
      const accessToken = await refreshGmailTokenIfNeeded(recipient);

      // Insert email into Gmail with priority label
      await gmail.users.messages.insert({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX', 'PRIORITY_INBOX_LABEL_ID'],
          raw: buildRawEmail(email)
        }
      });

      await db.query(`
        UPDATE scheduled_emails SET status = 'delivered' WHERE id = $1
      `, [email.id]);

      await db.query(`
        INSERT INTO delivery_log (scheduled_email_id, gmail_message_id)
        VALUES ($1, $2)
      `, [email.id, gmailMessageId]);

    } catch (err) {
      await db.query(`
        UPDATE scheduled_emails
        SET retry_count = retry_count + 1,
            next_attempt_at = NOW() + INTERVAL '5 minutes',
            status = CASE WHEN retry_count >= 5 THEN 'failed' ELSE 'pending' END
        WHERE id = $1
      `, [email.id]);
    }
  }
}
```

---

### Environment Variables

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Google OAuth + Gmail
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Payment rails
STRIPE_SECRET_KEY=
COINBASE_COMMERCE_API_KEY=
RPC_NODE_URL=                  # Alchemy or Infura endpoint
X402_SECRET=

# App
BASE_URL=                      # e.g. https://priorityinbox.com
PLATFORM_CUT_PERCENT=20        # platform takes 20%, recipient gets 80%
```

---

### Railway Deployment

Three resources in a single Railway project:

| Service | Type | Config |
|---|---|---|
| `api` | Web service | `npm run start`, exposes PORT |
| `worker` | Cron service | `npm run worker`, schedule: `* * * * *` |
| Supabase | External | `DATABASE_URL` set manually from Supabase dashboard |

Custom domain set on `api` service. Both `api` and `worker` share the same env vars via Railway's shared variable groups.

---

### Whitelisted Senders

If the sender's email is in the recipient's `whitelist`, the payment step is skipped entirely and the email is queued immediately. This handles known contacts, partners, and friends who shouldn't need to pay.

---

### v2 Considerations (Out of Scope for MVP)

- Recipient payout / withdrawal (Stripe Connect or similar)
- Outlook / IMAP support for non-Gmail recipients
- Per-person variable pricing exposed in registry
- Sender reputation scoring
- Rate limiting per sender
- Analytics dashboard for recipients
- MCP server so GTM agents can discover and call the registry natively
