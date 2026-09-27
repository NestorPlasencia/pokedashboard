export const binderSwipeDirection = (dx: number, dy: number): 'next' | 'previous' | null => {
  if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.25) return null;
  return dx < 0 ? 'next' : 'previous';
};
