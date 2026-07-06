import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePollContract } from './usePollContract';

vi.mock('../lib/soroban', () => {
  class ContractCallError extends Error {}
  return {
    getQuestion: vi.fn(),
    getResults: vi.fn(),
    hasVoted: vi.fn(),
    getVoterReputation: vi.fn(),
    buildVoteTransaction: vi.fn(),
    submitVoteTransaction: vi.fn(),
    ContractCallError,
  };
});

vi.mock('@creit.tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: {
    signTransaction: vi.fn(),
  },
}));

import * as soroban from '../lib/soroban';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';

const PUBLIC_KEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNOPQRSTUV';

describe('usePollContract', () => {
  beforeEach(() => {
    vi.mocked(soroban.getQuestion).mockResolvedValue('Ship it?');
    vi.mocked(soroban.getResults).mockResolvedValue([
      { label: 'Yes', votes: 0 },
      { label: 'No', votes: 0 },
    ]);
    vi.mocked(soroban.hasVoted).mockResolvedValue(false);
    vi.mocked(soroban.getVoterReputation).mockResolvedValue(0);
  });

  it('loads the poll question and results on mount', async () => {
    const { result, unmount } = renderHook(() => usePollContract(PUBLIC_KEY));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.question).toBe('Ship it?');
    expect(result.current.results).toHaveLength(2);
    unmount();
  });

  it('walks through building -> signing -> submitting -> success on a successful vote', async () => {
    vi.mocked(soroban.buildVoteTransaction).mockResolvedValue('UNSIGNED_XDR');
    vi.mocked(StellarWalletsKit.signTransaction).mockResolvedValue({
      signedTxXdr: 'SIGNED_XDR',
      signerAddress: PUBLIC_KEY,
    } as any);
    vi.mocked(soroban.submitVoteTransaction).mockResolvedValue('deadbeefhash');

    // After the vote, refresh() runs again — reflect the new tally so the
    // "reacts to a successful vote response" assertion has something to check.
    vi.mocked(soroban.getResults).mockResolvedValueOnce([
      { label: 'Yes', votes: 0 },
      { label: 'No', votes: 0 },
    ]);

    const { result, unmount } = renderHook(() => usePollContract(PUBLIC_KEY));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(soroban.getResults).mockResolvedValue([
      { label: 'Yes', votes: 1 },
      { label: 'No', votes: 0 },
    ]);
    vi.mocked(soroban.hasVoted).mockResolvedValue(true);
    vi.mocked(soroban.getVoterReputation).mockResolvedValue(1);

    await act(async () => {
      await result.current.vote(0);
    });

    expect(result.current.voteState).toEqual({ state: 'success', hash: 'deadbeefhash' });
    expect(result.current.voted).toBe(true);
    expect(result.current.reputation).toBe(1);
    expect(result.current.results[0].votes).toBe(1);

    unmount();
  });

  it('surfaces a readable error message when the wallet rejects signing', async () => {
    vi.mocked(soroban.buildVoteTransaction).mockResolvedValue('UNSIGNED_XDR');
    vi.mocked(StellarWalletsKit.signTransaction).mockRejectedValue(
      new Error('User declined access')
    );

    const { result, unmount } = renderHook(() => usePollContract(PUBLIC_KEY));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.vote(0);
    });

    expect(result.current.voteState.state).toBe('error');
    if (result.current.voteState.state === 'error') {
      expect(result.current.voteState.message).toMatch(/declined/i);
    }

    unmount();
  });
});
