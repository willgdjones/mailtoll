-- Recipients registered on the platform
CREATE TABLE recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  gmail_access_token TEXT NOT NULL,
  gmail_refresh_token TEXT NOT NULL,
  gmail_label_id TEXT,                  -- cached Mail Toll label ID
  price_usd NUMERIC(10, 4) NOT NULL DEFAULT 1.00,
  accepted_rails TEXT[] NOT NULL DEFAULT '{stripe,coinbase,stablecoin,x402}',
  whitelist TEXT[],
  category_preferences TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Used payment proofs to prevent replay attacks
CREATE TABLE payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_hash TEXT UNIQUE NOT NULL,
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
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | delivered | failed
  retry_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for worker polling
CREATE INDEX idx_scheduled_emails_pending
  ON scheduled_emails (next_attempt_at)
  WHERE status IN ('pending', 'processing');

-- Delivery receipts
CREATE TABLE delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_email_id UUID REFERENCES scheduled_emails(id),
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  gmail_message_id TEXT
);
