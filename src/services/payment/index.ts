import crypto from 'crypto';
import { supabase } from '../../db';
import { VerifyPaymentArgs } from '../../types';
import { verifyStripePayment } from './stripe';
import { verifyCoinbasePayment } from './coinbase';
import { verifyStablecoinPayment } from './stablecoin';
import { verifyX402Payment } from './x402';

export async function verifyPayment(args: VerifyPaymentArgs): Promise<boolean> {
  const { rail, proof, expected_amount_usd, recipient_id } = args;

  // 1. Hash proof for replay prevention
  const proofHash = crypto.createHash('sha256').update(proof).digest('hex');

  // Check if already used
  const { data: existing } = await supabase
    .from('payment_proofs')
    .select('id')
    .eq('proof_hash', proofHash)
    .single();

  if (existing) return false; // Replay detected

  // 2. Dispatch to rail-specific verifier
  let valid = false;
  switch (rail) {
    case 'stripe':
      valid = await verifyStripePayment(proof, expected_amount_usd);
      break;
    case 'coinbase':
      valid = await verifyCoinbasePayment(proof, expected_amount_usd);
      break;
    case 'stablecoin':
      valid = await verifyStablecoinPayment(proof, expected_amount_usd);
      break;
    case 'x402':
      valid = await verifyX402Payment(proof, expected_amount_usd);
      break;
    default:
      return false;
  }

  if (!valid) return false;

  // 3. Record proof to prevent replay
  await supabase.from('payment_proofs').insert({
    proof_hash: proofHash,
    rail,
    recipient_id,
    amount_usd: expected_amount_usd,
  });

  return true;
}

// Re-export for use in the schedule endpoint
export { getPaymentProofId } from './helpers';
