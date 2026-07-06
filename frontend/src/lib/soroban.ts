import {
  Contract,
  TransactionBuilder,
  Address,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  rpc,
} from '@stellar/stellar-sdk';
import { POLL_CONTRACT_ID, REWARDS_CONTRACT_ID, SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from './contractConfig';

export const server = new rpc.Server(SOROBAN_RPC_URL);

export class ContractCallError extends Error {}
export class NetworkError extends Error {}

export type PollResult = { label: string; votes: number };

/**
 * Build a transaction, simulate it, and decode the return value —
 * used for read-only contract calls. `sourcePublicKey` only supplies a
 * sequence-number envelope for the simulation; nothing is signed or
 * submitted for reads.
 */
async function simulateRead(
  contractId: string,
  method: string,
  args: unknown[],
  sourcePublicKey: string
) {
  let account;
  try {
    account = await server.getAccount(sourcePublicKey);
  } catch (err: any) {
    throw new NetworkError(err?.message || 'Could not reach Soroban RPC.');
  }

  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...(args as any)))
    .setTimeout(30)
    .build();

  let simulated;
  try {
    simulated = await server.simulateTransaction(tx);
  } catch (err: any) {
    throw new NetworkError(err?.message || `Could not simulate ${method}.`);
  }

  if (rpc.Api.isSimulationError(simulated)) {
    throw new ContractCallError(simulated.error || `Simulation failed for ${method}.`);
  }

  if (!simulated.result) {
    throw new ContractCallError(`No result returned from ${method}.`);
  }

  return scValToNative(simulated.result.retval);
}

export async function getQuestion(sourcePublicKey: string): Promise<string> {
  return simulateRead(POLL_CONTRACT_ID, 'get_question', [], sourcePublicKey);
}

export async function getResults(sourcePublicKey: string): Promise<PollResult[]> {
  const raw = await simulateRead(POLL_CONTRACT_ID, 'get_results', [], sourcePublicKey);
  // raw is an array of [string, bigint] tuples once decoded from ScVal.
  return (raw as [string, bigint][]).map(([label, votes]) => ({
    label,
    votes: Number(votes),
  }));
}

export async function hasVoted(sourcePublicKey: string, voter: string): Promise<boolean> {
  const addressArg = new Address(voter).toScVal();
  return simulateRead(POLL_CONTRACT_ID, 'has_voted', [addressArg], sourcePublicKey);
}

/**
 * Read a voter's reputation score. This calls the poll contract's
 * `get_voter_reputation`, which itself makes a read-only cross-contract call
 * into the rewards contract — so a successful result here is live proof of
 * inter-contract communication, not just a UI decoration.
 */
export async function getVoterReputation(
  sourcePublicKey: string,
  voter: string
): Promise<number> {
  const addressArg = new Address(voter).toScVal();
  const raw = await simulateRead(
    POLL_CONTRACT_ID,
    'get_voter_reputation',
    [addressArg],
    sourcePublicKey
  );
  return Number(raw);
}

/** Direct read against the rewards contract (bypassing the poll contract's proxy call). */
export async function getRewardsScoreDirect(
  sourcePublicKey: string,
  voter: string
): Promise<number> {
  const addressArg = new Address(voter).toScVal();
  const raw = await simulateRead(REWARDS_CONTRACT_ID, 'get_score', [addressArg], sourcePublicKey);
  return Number(raw);
}

/**
 * Build an unsigned, fee-and-footprint-prepared "vote" transaction ready for
 * wallet signing. Throws ContractCallError with a readable message if the
 * simulation itself already rejects the call (e.g. already voted, invalid
 * option index) so the caller doesn't need a wallet round-trip to find out.
 */
export async function buildVoteTransaction(
  voterPublicKey: string,
  optionIndex: number
): Promise<string> {
  let account;
  try {
    account = await server.getAccount(voterPublicKey);
  } catch (err: any) {
    throw new NetworkError(err?.message || 'Could not reach Soroban RPC.');
  }

  const contract = new Contract(POLL_CONTRACT_ID);

  const voterArg = new Address(voterPublicKey).toScVal();
  const optionArg = nativeToScVal(optionIndex, { type: 'u32' });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('vote', voterArg, optionArg))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

/** Submit a signed "vote" transaction and wait for it to land. */
export async function submitVoteTransaction(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sendResult = await server.sendTransaction(tx);

  if (sendResult.status === 'ERROR') {
    throw new ContractCallError(
      describeSorobanError(sendResult.errorResult?.toString()) ||
        'The network rejected the transaction.'
    );
  }

  const hash = sendResult.hash;

  // Poll for the final status — Soroban confirmations aren't instant.
  let attempts = 0;
  while (attempts < 15) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusResult = await server.getTransaction(hash);

    if (statusResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (statusResult.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new ContractCallError(
        describeSorobanError(JSON.stringify(statusResult.resultXdr)) ||
          'Transaction failed on-chain.'
      );
    }
    attempts += 1;
  }

  throw new ContractCallError('Timed out waiting for transaction confirmation.');
}

/** Turn common Soroban panic strings into plain-language messages. */
function describeSorobanError(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.includes('already voted')) return 'This address has already voted in this poll.';
  if (raw.includes('invalid option')) return 'That option no longer exists on the poll.';
  if (raw.includes('not initialized')) return 'The poll contract has not been initialized yet.';
  if (raw.includes('not the authorized poll contract'))
    return 'Your vote was recorded, but the reputation award was rejected (rewards contract misconfigured).';
  return null;
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function decodeVoteEvent(evt: any): { optionIndex: number; newCount: number } | null {
  try {
    const decoded = scValToNative(evt.value);
    const optionIndex = Number(decoded?.[0] ?? -1);
    const newCount = Number(decoded?.[1] ?? 0);
    return { optionIndex, newCount };
  } catch {
    return null;
  }
}

/**
 * Fetch recent "vote" events emitted by the poll contract, for a lightweight
 * real-time signal in addition to (or instead of) polling get_results().
 */
export async function getRecentVoteEvents(startLedger: number) {
  const events = await server.getEvents({
    startLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [POLL_CONTRACT_ID],
      },
    ],
  });
  return events.events;
}

export async function getLatestLedgerSequence(): Promise<number> {
  const latest = await server.getLatestLedger();
  return latest.sequence;
}
