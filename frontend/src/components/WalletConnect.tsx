import type { WalletState } from '../hooks/useWallet';

interface Props {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
}

function truncate(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletConnect({ wallet, onConnect, onDisconnect }: Props) {
  const orbClass =
    wallet.status === 'connecting'
      ? 'orb busy'
      : wallet.status === 'connected'
      ? 'orb live'
      : wallet.status === 'error'
      ? 'orb error'
      : 'orb';

  if (wallet.status === 'connected' && wallet.publicKey) {
    return (
      <div className="card">
        <p className="section-label">
          <span className={orbClass} aria-hidden="true" />
          Wallet
        </p>
        <div className="wallet-row">
          <div className="wallet-status">
            <div>
              <span className="wallet-address">{truncate(wallet.publicKey)}</span>
              <div className="wallet-provider">{wallet.walletName}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="empty-state">
        <span className={orbClass} aria-hidden="true" style={{ margin: '0 auto 14px' }} />
        <p>
          Connect a Stellar wallet — Freighter, xBull, or Albedo — to vote on the poll
          and see live results.
        </p>
        <button
          className="btn btn-primary"
          onClick={onConnect}
          disabled={wallet.status === 'connecting'}
          data-testid="connect-wallet-btn"
        >
          {wallet.status === 'connecting' ? 'Opening wallet selector…' : 'Connect Wallet'}
        </button>
        {wallet.status === 'error' && wallet.errorMessage && (
          <p className="field-error" data-testid="wallet-error">
            {wallet.errorKind === 'not_found' && '🔌 '}
            {wallet.errorKind === 'rejected' && '🚫 '}
            {wallet.errorKind === 'insufficient_balance' && '💰 '}
            {wallet.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
