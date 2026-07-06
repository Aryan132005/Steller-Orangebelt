import { VoteButton } from './VoteButton';
import { TransactionStatus } from './TransactionStatus';
import type { PollResult } from '../lib/soroban';
import type { VoteState } from '../hooks/usePollContract';

interface Props {
  question: string | null;
  results: PollResult[];
  voted: boolean;
  reputation: number | null;
  loading: boolean;
  loadError: string | null;
  isSyncing: boolean;
  voteState: VoteState;
  onVote: (index: number) => void;
  onRetry: () => void;
  votedOptionIndex: number | null;
}

export function PollCard({
  question,
  results,
  voted,
  reputation,
  loading,
  loadError,
  isSyncing,
  voteState,
  onVote,
  onRetry,
  votedOptionIndex,
}: Props) {
  const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);
  const isVoting = voteState.state === 'pending';

  if (loading) {
    return (
      <div className="card" data-testid="poll-loading">
        <p className="section-label">Poll</p>
        <div className="skeleton-line" style={{ width: '80%' }} />
        <div className="skeleton-line" style={{ width: '100%' }} />
        <div className="skeleton-line" style={{ width: '100%' }} />
        <div className="skeleton-line" style={{ width: '100%' }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card" data-testid="poll-error">
        <p className="section-label">
          <span className="orb error" aria-hidden="true" />
          Poll
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Couldn't reach the poll contract: {loadError}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          Double-check that <code>VITE_POLL_CONTRACT_ID</code> in your <code>.env</code>{' '}
          points to a deployed, initialized contract on testnet.
        </p>
        <button className="btn btn-ghost" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="card" data-testid="poll-card">
      <p className="section-label">
        <span className={isSyncing ? 'orb busy' : 'orb live'} aria-hidden="true" />
        Poll · {totalVotes} vote{totalVotes === 1 ? '' : 's'} · live
      </p>
      <p className="poll-question">{question}</p>

      {results.map((option, index) => (
        <VoteButton
          key={option.label + index}
          option={option}
          index={index}
          totalVotes={totalVotes}
          isVotedOption={voted && index === votedOptionIndex}
          disabled={voted || isVoting}
          onVote={onVote}
        />
      ))}

      {voted && voteState.state !== 'pending' && voteState.state !== 'success' && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
          You've already voted in this poll.
        </p>
      )}

      {reputation !== null && (
        <div className="reputation-badge" data-testid="reputation-badge">
          <span className="reputation-dot" aria-hidden="true" />
          Your reputation: <strong>{reputation}</strong> point{reputation === 1 ? '' : 's'}
          <span className="reputation-note"> · awarded by the rewards contract</span>
        </div>
      )}

      <TransactionStatus result={voteState} />
    </div>
  );
}
