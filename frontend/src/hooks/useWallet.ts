import { useCallback, useEffect, useState } from 'react';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';

export type WalletErrorKind =
  | 'not_found'
  | 'rejected'
  | 'insufficient_balance'
  | 'network'
  | null;

export type WalletState = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  publicKey: string | null;
  walletName: string | null;
  errorKind: WalletErrorKind;
  errorMessage: string | null;
};

const initialState: WalletState = {
  status: 'disconnected',
  publicKey: null,
  walletName: null,
  errorKind: null,
  errorMessage: null,
};

let kitInitialized = false;

function ensureKitInitialized() {
  if (kitInitialized) return;
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [new FreighterModule(), new xBullModule(), new AlbedoModule()],
  });
  kitInitialized = true;
}

/** Classify thrown errors from the kit into the 3+ required error categories. */
function classifyError(err: any): { kind: WalletErrorKind; message: string } {
  const raw = (err?.message || String(err) || '').toLowerCase();

  if (raw.includes('not installed') || raw.includes('not available') || raw.includes('no wallet')) {
    return {
      kind: 'not_found',
      message: 'That wallet extension isn\u2019t installed. Install it and try again.',
    };
  }
  if (raw.includes('reject') || raw.includes('declined') || raw.includes('denied') || raw.includes('cancel')) {
    return {
      kind: 'rejected',
      message: 'The request was rejected in the wallet.',
    };
  }
  if (raw.includes('insufficient') || raw.includes('underfunded') || raw.includes('balance')) {
    return {
      kind: 'insufficient_balance',
      message: 'This account doesn\u2019t have enough XLM to cover the transaction fee.',
    };
  }
  return {
    kind: 'network',
    message: err?.message || 'Something went wrong talking to the wallet or the network.',
  };
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(initialState);

  useEffect(() => {
    ensureKitInitialized();
  }, []);

  const connect = useCallback(async () => {
    setWallet((w) => ({ ...w, status: 'connecting', errorKind: null, errorMessage: null }));
    try {
      const { address } = await StellarWalletsKit.authModal();
      const selected = StellarWalletsKit.selectedModule;

      setWallet({
        status: 'connected',
        publicKey: address,
        walletName: selected?.productName || 'Wallet',
        errorKind: null,
        errorMessage: null,
      });
    } catch (err: any) {
      const { kind, message } = classifyError(err);
      setWallet({ ...initialState, status: 'error', errorKind: kind, errorMessage: message });
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch {
      // Disconnect is best-effort — clear local state regardless.
    }
    setWallet(initialState);
  }, []);

  return { wallet, connect, disconnect, classifyError };
}
