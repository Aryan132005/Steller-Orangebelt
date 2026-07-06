import { useCallback, useEffect, useRef, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import {
  getQuestion,
  getResults,
  hasVoted,
  getVoterReputation,
  buildVoteTransaction,
  submitVoteTransaction,
  ContractCallError,
  type PollResult,
} from '../lib/soroban';
import { NETWORK_PASSPHRASE, POLL_INTERVAL_MS, POLL_CONTRACT_ID } from '../lib/contractConfig';

export type VoteState =
  | { state: 'idle' }
  | { state: 'pending'; step: 'building' | 'signing' | 'submitting' | 'confirming' }
  | { state: 'success'; hash: string; reputationWarning?: string }
  | { state: 'error'; message: string };

export function usePollContract(publicKey: string | null) {
  const [question, setQuestion] = useState<string | null>(null);
  const [results, setResults] = useState<PollResult[]>([]);
  const [voted, setVoted] = useState(false);
  const [reputation, setReputation] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voteState, setVoteState] = useState<VoteState>({ state: 'idle' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [votedOptionIndex, setVotedOptionIndex] = useState<number | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setIsSyncing(true);
    try {
      const [q, r, v] = await Promise.all([
        getQuestion(publicKey),
        getResults(publicKey),
        hasVoted(publicKey, publicKey),
      ]);
      setQuestion(q);
      setResults(r);
      setVoted(v);
      setLoadError(null);

      // Reputation is fetched independently — its failure shouldn't block
      // the poll itself from rendering.
      try {
        const rep = await getVoterReputation(publicKey, publicKey);
        setReputation(rep);
      } catch {
        setReputation(null);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Could not reach the poll contract.');
    } finally {
      setIsSyncing(false);
    }
  }, [publicKey]);

  const initialLoad = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    await refresh();
    setLoading(false);
  }, [publicKey, refresh]);

  useEffect(() => {
    if (!publicKey) {
      setQuestion(null);
      setResults([]);
      setVoted(false);
      setReputation(null);
      setVotedOptionIndex(null);
      return;
    }

    const saved = localStorage.getItem(`poll_vote_${publicKey}_${POLL_CONTRACT_ID}`);
    if (saved !== null) {
      setVotedOptionIndex(Number(saved));
    } else {
      setVotedOptionIndex(null);
    }

    initialLoad();

    pollTimer.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  const vote = useCallback(
    async (optionIndex: number) => {
      if (!publicKey) return;
      setVoteState({ state: 'pending', step: 'building' });
      try {
        const unsignedXdr = await buildVoteTransaction(publicKey, optionIndex);

        setVoteState({ state: 'pending', step: 'signing' });
        const { signedTxXdr } = await StellarWalletsKit.signTransaction(unsignedXdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: publicKey,
        });

        setVoteState({ state: 'pending', step: 'submitting' });
        const hash = await submitVoteTransaction(signedTxXdr);

        // Persist the selection locally
        localStorage.setItem(`poll_vote_${publicKey}_${POLL_CONTRACT_ID}`, String(optionIndex));
        setVotedOptionIndex(optionIndex);

        setVoteState({ state: 'success', hash });

        // A refresh hiccup right after a confirmed vote shouldn't flip the
        // UI back to an error state — the vote already succeeded on-chain.
        try {
          await refresh();
        } catch {
          setVoteState({
            state: 'success',
            hash,
            reputationWarning: 'Vote confirmed, but results/reputation refresh failed.',
          });
        }
      } catch (err: any) {
        const message =
          err instanceof ContractCallError
            ? err.message
            : err?.message || 'Something went wrong casting your vote.';
        setVoteState({ state: 'error', message });
      }
    },
    [publicKey, refresh]
  );

  const resetVoteState = useCallback(() => setVoteState({ state: 'idle' }), []);

  const retry = useCallback(() => {
    initialLoad();
  }, [initialLoad]);

  return {
    question,
    results,
    voted,
    reputation,
    loading,
    loadError,
    isSyncing,
    voteState,
    vote,
    resetVoteState,
    refresh,
    retry,
    votedOptionIndex,
  };
}
