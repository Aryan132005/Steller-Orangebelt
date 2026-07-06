import type { PollResult } from '../lib/soroban';

interface Props {
  option: PollResult;
  index: number;
  totalVotes: number;
  isVotedOption: boolean;
  disabled: boolean;
  onVote: (index: number) => void;
}

export function VoteButton({ option, index, totalVotes, isVotedOption, disabled, onVote }: Props) {
  const pct = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;

  return (
    <div className="poll-option">
      <button
        type="button"
        className={`poll-option-btn${isVotedOption ? ' voted-for' : ''}`}
        onClick={() => onVote(index)}
        disabled={disabled}
        data-testid={`vote-option-${index}`}
      >
        <span className="poll-option-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
        <span className="poll-option-content">
          <span className="poll-option-label">
            {option.label}
            {isVotedOption && <span className="voted-badge">YOUR VOTE</span>}
          </span>
          <span className="poll-option-stats">
            {option.votes} · {pct}%
          </span>
        </span>
      </button>
    </div>
  );
}
