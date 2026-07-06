import { explorerTxUrl } from '../lib/soroban';
import type { VoteState } from '../hooks/usePollContract';

const stepLabel: Record<string, string> = {
  building: 'Building the vote transaction…',
  signing: 'Waiting for your wallet signature…',
  submitting: 'Submitting to Soroban testnet…',
  confirming: 'Waiting for confirmation…',
};

export function TransactionStatus({ result }: { result: VoteState }) {
  if (result.state === 'idle') return null;

  if (result.state === 'pending') {
    return (
      <div className="tx-status pending">
        <span className="orb busy" aria-hidden="true" style={{ marginTop: 4 }} />
        <div>
          <p className="tx-status-title">Casting your vote…</p>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>{stepLabel[result.step]}</p>
        </div>
      </div>
    );
  }

  if (result.state === 'success') {
    return (
      <div className="tx-status success" data-testid="tx-success">
        <span className="orb live" aria-hidden="true" style={{ marginTop: 4 }} />
        <div>
          <p className="tx-status-title">Vote confirmed</p>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {result.reputationWarning ||
              'Your vote was recorded on-chain and results have been refreshed.'}
          </p>
          <span className="tx-hash">{result.hash}</span>
          <div style={{ marginTop: 8 }}>
            <a href={explorerTxUrl(result.hash)} target="_blank" rel="noreferrer">
              View on Stellar Expert →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-status error" data-testid="tx-error">
      <span className="orb error" aria-hidden="true" style={{ marginTop: 4 }} />
      <div>
        <p className="tx-status-title">Vote failed</p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{result.message}</p>
      </div>
    </div>
  );
}
