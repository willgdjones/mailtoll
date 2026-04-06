import { config } from '../../config';

// x402 uses subpath exports requiring modern moduleResolution.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const x402Verify = require('x402/verify');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const x402Schemes = require('x402/schemes');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const x402Shared = require('x402/shared');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const coinbaseX402 = require('@coinbase/x402');

const X402_VERSION = 1;

function getFacilitator() {
  // Use CDP facilitator with auth if API keys are available
  if (config.cdpApiKeyId && config.cdpApiKeySecret) {
    console.log('[x402] Using CDP facilitator with auth');
    const facilitatorConfig = coinbaseX402.createFacilitatorConfig(
      config.cdpApiKeyId,
      config.cdpApiKeySecret,
    );
    return x402Verify.useFacilitator(facilitatorConfig);
  }
  console.log('[x402] Using default facilitator:', config.x402FacilitatorUrl);
  return x402Verify.useFacilitator({
    url: config.x402FacilitatorUrl,
  });
}

/**
 * Build x402 PaymentRequirements for a given price and resource URL.
 */
export function buildX402PaymentRequirements(
  priceUsd: number,
  resourceUrl: string,
  payTo?: string,
): Record<string, unknown>[] {
  const walletAddress = payTo || config.walletAddress;
  if (!walletAddress) {
    throw new Error('No wallet address configured for x402 payments');
  }

  const network = config.x402Network;
  const atomicAmount = x402Shared.processPriceToAtomicAmount(`$${priceUsd}`, network);
  if ('error' in atomicAmount) {
    throw new Error(`x402 price conversion error: ${atomicAmount.error}`);
  }

  const { maxAmountRequired, asset } = atomicAmount;

  return [
    {
      scheme: 'exact',
      network,
      maxAmountRequired,
      resource: resourceUrl,
      description: 'Payment for priority email delivery via Mail Toll',
      mimeType: 'application/json',
      payTo: walletAddress,
      maxTimeoutSeconds: 60,
      asset: asset.address,
      extra: asset.eip712,
    },
  ];
}

/**
 * Build the base64-encoded X-PAYMENT-REQUIRED header value.
 */
export function encodePaymentRequiredHeader(requirements: Record<string, unknown>[]): string {
  return Buffer.from(JSON.stringify(x402Shared.toJsonSafe(requirements))).toString('base64');
}

/**
 * Verify and settle an x402 payment from the X-PAYMENT header.
 */
export async function verifyAndSettleX402(
  xPaymentHeader: string,
  paymentRequirements: Record<string, unknown>[],
): Promise<{ success: true; payer: string } | { success: false; error: string }> {
  const facilitator = getFacilitator();

  // Decode the payment from the header
  let decodedPayment: Record<string, unknown>;
  try {
    decodedPayment = x402Schemes.exact.evm.decodePayment(xPaymentHeader);
    decodedPayment.x402Version = X402_VERSION;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Invalid or malformed X-PAYMENT header',
    };
  }

  // Find matching requirements
  const matched = x402Shared.findMatchingPaymentRequirements(paymentRequirements, decodedPayment);
  if (!matched) {
    return { success: false, error: 'No matching payment requirements for this payment' };
  }

  // Verify
  try {
    const verifyResult = await facilitator.verify(decodedPayment, matched);
    if (!verifyResult.isValid) {
      return {
        success: false,
        error: verifyResult.invalidReason || 'Payment verification failed',
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Payment verification failed',
    };
  }

  // Settle
  try {
    const settleResult = await facilitator.settle(decodedPayment, matched);
    if (!settleResult.success) {
      return {
        success: false,
        error: settleResult.errorReason || 'Payment settlement failed',
      };
    }
    return { success: true, payer: settleResult.payer || '' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Payment settlement failed',
    };
  }
}
