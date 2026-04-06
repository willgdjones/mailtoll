/**
 * Test agent script — simulates a GTM agent paying via x402 to send an email.
 *
 * Usage: npx ts-node scripts/test-agent.ts
 */
import dotenv from 'dotenv';
dotenv.config();

const x402Schemes = require('x402/schemes');
const x402Shared = require('x402/shared');

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const BASE_URL = 'https://mailtoll-production.up.railway.app';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;

if (!AGENT_PRIVATE_KEY) {
  console.error('Missing AGENT_PRIVATE_KEY in .env');
  process.exit(1);
}

async function main() {
  const handle = 'will';

  // Step 1: Query registry
  console.log(`\n[1] Querying registry for "${handle}"...`);
  const registryRes = await fetch(`${BASE_URL}/registry/${handle}`);
  const registry = await registryRes.json();
  console.log('   Registry:', JSON.stringify(registry, null, 2));

  // Step 2: POST /schedule without payment to get 402
  console.log('\n[2] Posting to /schedule without payment...');
  const scheduleRes = await fetch(`${BASE_URL}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle,
      sender_email: 'test-agent@mailtoll.app',
      subject: 'Hello from a GTM agent!',
      body: 'This is a test message sent via the x402 payment protocol on Base mainnet. The toll has been paid in USDC.',
    }),
  });

  const scheduleBody = await scheduleRes.json();
  console.log(`   Status: ${scheduleRes.status}`);
  console.log('   Body:', JSON.stringify(scheduleBody, null, 2));

  // Get x402 payment requirements from the X-PAYMENT-REQUIRED header
  const paymentRequiredHeader = scheduleRes.headers.get('x-payment-required');
  if (!paymentRequiredHeader) {
    console.error('   No X-PAYMENT-REQUIRED header received. Is x402 enabled for this recipient?');
    process.exit(1);
  }

  const paymentRequirements = JSON.parse(
    Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8')
  );
  console.log('\n   Payment requirements:', JSON.stringify(paymentRequirements, null, 2));

  // Step 3: Sign the payment with our agent wallet
  console.log('\n[3] Signing x402 payment...');
  const account = privateKeyToAccount(`0x${AGENT_PRIVATE_KEY}`);
  console.log(`   Agent wallet: ${account.address}`);

  const xPaymentHeader = await x402Schemes.exact.evm.createPaymentHeader(
    account,
    1, // x402Version
    paymentRequirements[0],
  );
  console.log(`   X-PAYMENT header: ${xPaymentHeader.substring(0, 60)}...`);

  // Debug: decode the payment to inspect
  const decoded = x402Schemes.exact.evm.decodePayment(xPaymentHeader);
  console.log('   Decoded payment:', JSON.stringify(decoded, null, 2));

  // Step 4: Resubmit /schedule with X-PAYMENT header
  console.log('\n[4] Resubmitting /schedule with payment...');
  const paidRes = await fetch(`${BASE_URL}/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': xPaymentHeader,
    },
    body: JSON.stringify({
      handle,
      sender_email: 'test-agent@mailtoll.app',
      subject: 'Hello from a GTM agent!',
      body: 'This is a test message sent via the x402 payment protocol on Base mainnet. The toll has been paid in USDC.',
    }),
  });

  const paidBody = await paidRes.json();
  console.log(`   Status: ${paidRes.status}`);
  console.log('   Body:', JSON.stringify(paidBody, null, 2));

  if (paidRes.status === 201) {
    console.log('\n✅ Email queued successfully! Check your Gmail for the "Mail Toll" label.');
  } else {
    console.log('\n❌ Payment or scheduling failed.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
