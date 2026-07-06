import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletConnect } from '../components/WalletConnect';
import type { WalletState } from '../hooks/useWallet';

const disconnected: WalletState = {
  status: 'disconnected',
  publicKey: null,
  walletName: null,
  errorKind: null,
  errorMessage: null,
};

describe('WalletConnect', () => {
  it('shows a "Connect Wallet" button when disconnected', () => {
    render(<WalletConnect wallet={disconnected} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByTestId('connect-wallet-btn')).toHaveTextContent('Connect Wallet');
  });

  it('calls onConnect when the connect button is clicked', async () => {
    const onConnect = vi.fn();
    render(<WalletConnect wallet={disconnected} onConnect={onConnect} onDisconnect={vi.fn()} />);
    await userEvent.click(screen.getByTestId('connect-wallet-btn'));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('disables the connect button and shows a connecting label while connecting', () => {
    const connecting: WalletState = { ...disconnected, status: 'connecting' };
    render(<WalletConnect wallet={connecting} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    const btn = screen.getByTestId('connect-wallet-btn');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/opening wallet selector/i);
  });

  it('shows the connected address and a Disconnect button once connected', () => {
    const connected: WalletState = {
      status: 'connected',
      publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNOPQRSTUV',
      walletName: 'Freighter',
      errorKind: null,
      errorMessage: null,
    };
    render(<WalletConnect wallet={connected} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByText('Freighter')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it.each([
    ['not_found', /isn.t installed/i],
    ['rejected', /rejected/i],
    ['insufficient_balance', /enough xlm/i],
  ] as const)('renders the %s error message', (errorKind, expectedText) => {
    const errored: WalletState = {
      status: 'error',
      publicKey: null,
      walletName: null,
      errorKind,
      errorMessage:
        errorKind === 'not_found'
          ? "That wallet extension isn't installed. Install it and try again."
          : errorKind === 'rejected'
          ? 'The request was rejected in the wallet.'
          : "This account doesn't have enough XLM to cover the transaction fee.",
    };
    render(<WalletConnect wallet={errored} onConnect={vi.fn()} onDisconnect={vi.fn()} />);
    expect(screen.getByTestId('wallet-error')).toHaveTextContent(expectedText);
  });
});
