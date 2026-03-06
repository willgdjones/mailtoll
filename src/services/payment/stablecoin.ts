import { ethers } from 'ethers';
import { config } from '../../config';

// USDC contract addresses (mainnet)
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_DECIMALS = 6;

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

export async function verifyStablecoinPayment(txHash: string, expectedAmountUsd: number): Promise<boolean> {
  if (!config.rpcNodeUrl) throw new Error('RPC_NODE_URL not configured');

  const provider = new ethers.JsonRpcProvider(config.rpcNodeUrl);
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt || receipt.status !== 1) return false;

  // Find USDC Transfer event in logs
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC
    ) {
      // Decode amount from data (uint256)
      const amount = BigInt(log.data);
      const amountUsd = Number(amount) / 10 ** USDC_DECIMALS;

      if (amountUsd >= expectedAmountUsd) return true;
    }
  }

  return false;
}
