import { config } from '../../config';

const COINBASE_API = 'https://api.commerce.coinbase.com';

interface CoinbaseCharge {
  data: {
    id: string;
    timeline: Array<{ status: string }>;
    pricing: {
      local: { amount: string; currency: string };
    };
  };
}

export async function verifyCoinbasePayment(chargeId: string, expectedAmountUsd: number): Promise<boolean> {
  const res = await fetch(`${COINBASE_API}/charges/${chargeId}`, {
    headers: {
      'X-CC-Api-Key': config.coinbaseCommerceApiKey,
      'X-CC-Version': '2018-03-22',
    },
  });

  if (!res.ok) return false;

  const charge = (await res.json()) as CoinbaseCharge;
  const lastStatus = charge.data.timeline[charge.data.timeline.length - 1]?.status;

  if (lastStatus !== 'COMPLETED' && lastStatus !== 'RESOLVED') return false;

  const paidUsd = parseFloat(charge.data.pricing.local.amount);
  if (paidUsd < expectedAmountUsd) return false;

  return true;
}

export async function createCoinbaseCharge(amountUsd: number, recipientHandle: string): Promise<{ chargeId: string; hostedUrl: string }> {
  const res = await fetch(`${COINBASE_API}/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': config.coinbaseCommerceApiKey,
      'X-CC-Version': '2018-03-22',
    },
    body: JSON.stringify({
      name: `Mail Toll message to ${recipientHandle}`,
      description: 'Payment for priority email delivery',
      pricing_type: 'fixed_price',
      local_price: { amount: amountUsd.toFixed(2), currency: 'USD' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase charge creation failed: ${err}`);
  }

  const data = (await res.json()) as { data: { id: string; hosted_url: string } };
  return {
    chargeId: data.data.id,
    hostedUrl: data.data.hosted_url,
  };
}
