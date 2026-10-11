import { BookmarkCheck } from 'lucide-react';
import type { CollectionMark } from '../../utils/collectionMarks';

export function CollectionMarkBadge({ marks, compact = false }: { marks: CollectionMark[]; compact?: boolean }) {
  if (!marks.length) return null;
  const isWish = marks.some(mark => mark.kind === 'wishlist');
  const names = marks.map(mark => mark.name).join(', ');
  const label = `${isWish ? 'Wish' : 'Marked'}: ${names}`;
  return <span className={`collection-mark-badge${isWish ? ' collection-mark-badge--wish' : ''}`} title={label} aria-label={label}>
    <BookmarkCheck size={12} aria-hidden="true" />
    <span>{compact ? isWish ? 'Wish' : 'Marked' : label}</span>
  </span>;
}
