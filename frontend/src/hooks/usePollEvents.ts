import { useEffect, useRef, useState } from 'react';
import { getRecentVoteEvents, getLatestLedgerSequence, decodeVoteEvent } from '../lib/soroban';

export type VoteEvent = {
  id: string;
  ledger: number;
  optionIndex: number;
  newCount: number;
};

const LEDGER_LOOKBACK = 200; // roughly the last ~15-20 minutes on testnet

/**
 * Polls Soroban's getEvents for recent "vote" events emitted by the contract,
 * giving the UI a lightweight activity feed independent of re-fetching full
 * poll results.
 */
export function usePollEvents(enabled: boolean, intervalMs = 8000) {
  const [events, setEvents] = useState<VoteEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const latest = await getLatestLedgerSequence();
        const startLedger = Math.max(latest - LEDGER_LOOKBACK, 1);
        const raw = await getRecentVoteEvents(startLedger);

        if (cancelled) return;

        const fresh: VoteEvent[] = [];
        for (const evt of raw) {
          const id = evt.id;
          if (seenIds.current.has(id)) continue;
          seenIds.current.add(id);

          const decoded = decodeVoteEvent(evt);
          if (decoded) {
            fresh.push({
              id,
              ledger: evt.ledger,
              optionIndex: decoded.optionIndex,
              newCount: decoded.newCount,
            });
          }
        }

        if (fresh.length > 0) {
          setEvents((prev) => [...fresh, ...prev].slice(0, 20));
        }
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not fetch live events.');
      }
    }

    poll();
    timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return { events, error };
}
