import { test } from 'node:test';
import assert from 'node:assert/strict';

const { binderSwipeDirection } = await import('../src/utils/binderSwipe.ts');

test('horizontal binder swipes turn in the expected direction', () => {
  assert.equal(binderSwipeDirection(-80, 12), 'next');
  assert.equal(binderSwipeDirection(80, -12), 'previous');
});

test('short and vertical gestures keep the current page', () => {
  assert.equal(binderSwipeDirection(-30, 0), null);
  assert.equal(binderSwipeDirection(80, 100), null);
  assert.equal(binderSwipeDirection(-50, 40), null);
});
