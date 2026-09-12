import { test } from 'node:test';
import assert from 'node:assert/strict';

// route.ts reads window.location only inside its functions, and the shared-link helper
// takes the pathname as an argument, so this stand-in only has to exist.
globalThis.window = { location: { search: '', pathname: '/' } };

const { publicCollectionId, pathForPublicCollection, routeFromPath } =
  await import('../src/utils/route.ts');

const SHARED_ID = 'a0000000-0000-0000-0000-000000000001';

test('a shared collection link is recognised by its id', () => {
  assert.equal(publicCollectionId(`/c/${SHARED_ID}`), SHARED_ID);
});

test('a trailing slash on a shared link still resolves', () => {
  assert.equal(publicCollectionId(`/c/${SHARED_ID}/`), SHARED_ID);
});

test('the app pages are not shared links', () => {
  for (const pathname of ['/', '/collections', '/settings']) {
    assert.equal(publicCollectionId(pathname), null, pathname);
  }
});

test('a malformed id is not treated as a shared collection', () => {
  // Anything that is not a real id is a mistyped link, and falls through to the app
  // rather than rendering a public page that could only fail to load.
  for (const pathname of ['/c/', '/c/nope', '/c/a0000000-0000-0000-0000', `/c/${SHARED_ID}extra`]) {
    assert.equal(publicCollectionId(pathname), null, pathname);
  }
});

test('a shared link round trips through the path builder', () => {
  assert.equal(publicCollectionId(pathForPublicCollection(SHARED_ID)), SHARED_ID);
});

test('a shared link is not one of the navigable pages', () => {
  // Deliberate: the public view is picked before the router ever runs, so as far as
  // `Route` is concerned this address is just an unknown one.
  assert.equal(routeFromPath(`/c/${SHARED_ID}`), 'catalog');
});
