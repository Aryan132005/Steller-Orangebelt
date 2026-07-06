import type { VoteEvent } from '../hooks/usePollEvents';

export function ActivityFeed({ events, error }: { events: VoteEvent[]; error: string | null }) {
  if (error) {
    return (
      <div className="card">
        <p className="section-label">Live Activity</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Live event feed unavailable right now — vote counts above still refresh on
          their own.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="section-label">
        <span className="orb live" aria-hidden="true" />
        Live Activity
      </p>
      {events.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No votes yet — cast one to see it appear here in real time.
        </p>
      ) : (
        <ul className="activity-list">
          {events.map((evt) => (
            <li key={evt.id} className="activity-item">
              Ledger {evt.ledger} · option {evt.optionIndex} now at {evt.newCount} vote
              {evt.newCount === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
