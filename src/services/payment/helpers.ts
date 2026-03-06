import crypto from 'crypto';
import { supabase } from '../../db';

export async function getPaymentProofId(proof: string): Promise<string | null> {
  const proofHash = crypto.createHash('sha256').update(proof).digest('hex');
  const { data } = await supabase
    .from('payment_proofs')
    .select('id')
    .eq('proof_hash', proofHash)
    .single();
  return data?.id ?? null;
}
