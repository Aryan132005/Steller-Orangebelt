import { Networks } from '@stellar/stellar-sdk';

/**
 * Reads from Vite environment variables (see .env.example). Copy
 * .env.example to .env and fill in your deployed contract IDs — do not
 * hardcode them here so different environments (local, CI, staging,
 * production) can point at different deployments.
 */
function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key];
  if (!value || value.startsWith('REPLACE_WITH')) {
    return fallback;
  }
  return value;
}

export const POLL_CONTRACT_ID = readEnv(
  'VITE_POLL_CONTRACT_ID',
  'REPLACE_WITH_DEPLOYED_POLL_CONTRACT_ID'
);

export const REWARDS_CONTRACT_ID = readEnv(
  'VITE_REWARDS_CONTRACT_ID',
  'REPLACE_WITH_DEPLOYED_REWARDS_CONTRACT_ID'
);

export const SOROBAN_RPC_URL = readEnv(
  'VITE_SOROBAN_RPC_URL',
  'https://soroban-testnet.stellar.org'
);

export const HORIZON_URL = readEnv('VITE_HORIZON_URL', 'https://horizon-testnet.stellar.org');

export const NETWORK_PASSPHRASE = Networks.TESTNET;

/** How often (ms) the UI re-checks poll results for live updates. */
export const POLL_INTERVAL_MS = 6000;

export const isConfigured =
  !POLL_CONTRACT_ID.startsWith('REPLACE_WITH') && !REWARDS_CONTRACT_ID.startsWith('REPLACE_WITH');
