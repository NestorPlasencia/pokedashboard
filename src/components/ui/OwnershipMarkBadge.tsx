import { CircleCheck, CircleDashed } from 'lucide-react';
import type { Card } from '../../types/dashboard';

/** Badge for the "Mark owned / Mark not owned" collection modes: flags the card without dimming it. */
export function OwnershipMarkBadge({ card, inline = false }: { card: Pick<Card, 'ownershipMark'>; inline?: boolean }) {
  if (!card.ownershipMark) return null;
  const owned = card.ownershipMark === 'owned';
  const label = owned ? 'Owned' : 'Not owned';
  return <span
    className={`ownership-mark-badge ownership-mark-badge--${owned ? 'owned' : 'missing'}${inline ? ' ownership-mark-badge--inline' : ''}`}
    title={label}
    aria-label={label}
  >
    {owned ? <CircleCheck size={13} aria-hidden="true" /> : <CircleDashed size={13} aria-hidden="true" />}
    <span>{label}</span>
  </span>;
}
