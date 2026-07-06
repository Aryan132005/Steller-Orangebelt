import { useWallet } from './hooks/useWallet';
import { usePollContract } from './hooks/usePollContract';
import { usePollEvents } from './hooks/usePollEvents';
import { WalletConnect } from './components/WalletConnect';
import { PollCard } from './components/PollCard';
import { ActivityFeed } from './components/ActivityFeed';
import { isConfigured } from './lib/contractConfig';

function LumenMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 34 34" fill="none">
      <circle cx="17" cy="17" r="16" stroke="#F2C14E" strokeWidth="1.4" opacity="0.5" />
      <circle cx="17" cy="17" r="5" fill="#F2C14E" />
      <circle cx="17" cy="17" r="10.5" stroke="#F2C14E" strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

export default function App() {
  const { wallet, connect, disconnect } = useWallet();
  const isConnected = wallet.status === 'connected' && wallet.publicKey;

  const {
    question,
    results,
    voted,
    reputation,
    loading,
    loadError,
    isSyncing,
    voteState,
    vote,
    retry,
    votedOptionIndex,
  } = usePollContract(wallet.publicKey);

  const { events, error: eventsError } = usePollEvents(Boolean(isConnected));

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <LumenMark />
          <div>
            <h1>Live Poll Pro</h1>
            <p className="tagline">Soroban contracts on Stellar Testnet</p>
          </div>
        </div>
      </header>

      {!isConfigured && (
        <div className="card config-warning" data-testid="config-warning">
          <p className="section-label">
            <span className="orb error" aria-hidden="true" />
            Setup needed
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Copy <code>.env.example</code> to <code>.env</code> and fill in your deployed{' '}
            <code>VITE_POLL_CONTRACT_ID</code> and <code>VITE_REWARDS_CONTRACT_ID</code>{' '}
            before running this app against real contracts.
          </p>
        </div>
      )}

      <WalletConnect wallet={wallet} onConnect={connect} onDisconnect={disconnect} />

      {isConnected && wallet.publicKey && (
        <>
          <PollCard
            question={question}
            results={results}
            voted={voted}
            reputation={reputation}
            loading={loading}
            loadError={loadError}
            isSyncing={isSyncing}
            voteState={voteState}
            onVote={vote}
            onRetry={retry}
            votedOptionIndex={votedOptionIndex}
          />
          <ActivityFeed events={events} error={eventsError} />
        </>
      )}

      <p className="footer-note">Stellar Testnet · Level 3 Orange Belt Submission</p>
    </div>
  );
}
