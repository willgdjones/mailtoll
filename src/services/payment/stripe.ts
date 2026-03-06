import Stripe from 'stripe';
import { config } from '../../config';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    if (!config.stripeSecretKey) throw new Error('STRIPE_SECRET_KEY not configured');
    stripeClient = new Stripe(config.stripeSecretKey);
  }
  return stripeClient;
}

export async function verifyStripePayment(proof: string, expectedAmountUsd: number): Promise<boolean> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(proof);

  if (pi.status !== 'succeeded') return false;

  // Stripe amounts are in cents
  const paidUsd = pi.amount / 100;
  if (paidUsd < expectedAmountUsd) return false;

  return true;
}

export async function createStripePaymentIntent(amountUsd: number): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.create({
    amount: Math.round(amountUsd * 100),
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
  });

  return {
    clientSecret: pi.client_secret!,
    paymentIntentId: pi.id,
  };
}
