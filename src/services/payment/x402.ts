import { config } from '../../config';

export async function verifyX402Payment(proof: string, expectedAmountUsd: number): Promise<boolean> {
  const res = await fetch(`${config.x402FacilitatorUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_proof: proof,
      expected_amount: expectedAmountUsd.toFixed(2),
      asset: 'USDC',
    }),
  });

  if (!res.ok) return false;

  const data = (await res.json()) as { valid: boolean };
  return data.valid === true;
}
