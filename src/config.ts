import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  baseUrl: required('BASE_URL'),

  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  databaseUrl: required('DATABASE_URL'),

  // Google OAuth
  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: required('GOOGLE_REDIRECT_URI'),

  // Payment rails
  stripeSecretKey: optional('STRIPE_SECRET_KEY', ''),
  coinbaseCommerceApiKey: optional('COINBASE_COMMERCE_API_KEY', ''),
  rpcNodeUrl: optional('RPC_NODE_URL', ''),
  x402FacilitatorUrl: optional('X402_FACILITATOR_URL', 'https://x402.org/facilitator'),
  x402Network: optional('X402_NETWORK', 'base-sepolia') as 'base-sepolia' | 'base',
  walletAddress: optional('WALLET_ADDRESS', ''),
  cdpApiKeyId: optional('CDP_API_KEY_ID', ''),
  cdpApiKeySecret: optional('CDP_API_KEY_SECRET', ''),

  // App
  platformCutPercent: parseInt(optional('PLATFORM_CUT_PERCENT', '20'), 10),
  jwtSecret: required('JWT_SECRET'),
};
