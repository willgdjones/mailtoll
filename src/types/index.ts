export interface Recipient {
  id: string;
  google_id: string;
  email: string;
  handle: string;
  gmail_access_token: string;
  gmail_refresh_token: string;
  gmail_label_id: string | null;
  price_usd: number;
  accepted_rails: string[];
  whitelist: string[] | null;
  category_preferences: string | null;
  created_at: string;
}

export interface PaymentProof {
  id: string;
  proof_hash: string;
  rail: PaymentRail;
  recipient_id: string;
  amount_usd: number;
  used_at: string;
}

export interface ScheduledEmail {
  id: string;
  recipient_id: string;
  sender_email: string;
  subject: string;
  body: string;
  payment_proof_id: string | null;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  retry_count: number;
  next_attempt_at: string;
  created_at: string;
}

export interface DeliveryLog {
  id: string;
  scheduled_email_id: string;
  delivered_at: string;
  gmail_message_id: string | null;
}

export type PaymentRail = 'stripe' | 'coinbase' | 'stablecoin' | 'x402';

export interface PaymentProofInput {
  rail: PaymentRail;
  proof: string;
}

export interface ScheduleRequest {
  handle: string;
  sender_email: string;
  subject: string;
  body: string;
  payment_proof?: PaymentProofInput;
}

export interface VerifyPaymentArgs {
  rail: PaymentRail;
  proof: string;
  expected_amount_usd: number;
  recipient_id: string;
}
