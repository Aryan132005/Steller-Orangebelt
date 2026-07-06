import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteButton } from '../components/VoteButton';

describe('VoteButton', () => {
  it('renders the option label and computed percentage', () => {
    render(
      <VoteButton
        option={{ label: 'Rust', votes: 3 }}
        index={0}
        totalVotes={4}
        isVotedOption={false}
        disabled={false}
        onVote={vi.fn()}
      />
    );
    expect(screen.getByText('Rust')).toBeInTheDocument();
    expect(screen.getByText(/3 · 75%/)).toBeInTheDocument();
  });

  it('shows 0% when there are no votes yet', () => {
    render(
      <VoteButton
        option={{ label: 'TypeScript', votes: 0 }}
        index={1}
        totalVotes={0}
        isVotedOption={false}
        disabled={false}
        onVote={vi.fn()}
      />
    );
    expect(screen.getByText(/0 · 0%/)).toBeInTheDocument();
  });

  it('calls onVote with its index when clicked', async () => {
    const onVote = vi.fn();
    render(
      <VoteButton
        option={{ label: 'Both', votes: 1 }}
        index={2}
        totalVotes={1}
        isVotedOption={false}
        disabled={false}
        onVote={onVote}
      />
    );
    await userEvent.click(screen.getByTestId('vote-option-2'));
    expect(onVote).toHaveBeenCalledWith(2);
  });

  it('is disabled after the user has already voted', () => {
    render(
      <VoteButton
        option={{ label: 'Rust', votes: 1 }}
        index={0}
        totalVotes={1}
        isVotedOption={true}
        disabled={true}
        onVote={vi.fn()}
      />
    );
    expect(screen.getByTestId('vote-option-0')).toBeDisabled();
    expect(screen.getByText('YOUR VOTE')).toBeInTheDocument();
  });
});
