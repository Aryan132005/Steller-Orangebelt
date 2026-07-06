import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionStatus } from '../components/TransactionStatus';
import type { VoteState } from '../hooks/usePollContract';

describe('TransactionStatus', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<TransactionStatus result={{ state: 'idle' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the correct step label while pending', () => {
    const pending: VoteState = { state: 'pending', step: 'signing' };
    render(<TransactionStatus result={pending} />);
    expect(screen.getByText(/waiting for your wallet signature/i)).toBeInTheDocument();
  });

  it('shows the transaction hash and explorer link on success', () => {
    const success: VoteState = { state: 'success', hash: 'abc123hash' };
    render(<TransactionStatus result={success} />);
    expect(screen.getByTestId('tx-success')).toBeInTheDocument();
    expect(screen.getByText('abc123hash')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view on stellar expert/i })).toHaveAttribute(
      'href',
      expect.stringContaining('abc123hash')
    );
  });

  it('shows a reputation warning instead of the default success message when present', () => {
    const success: VoteState = {
      state: 'success',
      hash: 'abc123hash',
      reputationWarning: 'Vote confirmed, but results/reputation refresh failed.',
    };
    render(<TransactionStatus result={success} />);
    expect(screen.getByText(/reputation refresh failed/i)).toBeInTheDocument();
  });

  it('shows the failure reason on error', () => {
    const errored: VoteState = { state: 'error', message: 'This address has already voted.' };
    render(<TransactionStatus result={errored} />);
    expect(screen.getByTestId('tx-error')).toHaveTextContent('This address has already voted.');
  });
});
