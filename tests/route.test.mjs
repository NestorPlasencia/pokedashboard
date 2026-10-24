import { test } from 'node:test';
import assert from 'node:assert/strict';

// route.ts reads window.location only inside its functions, and the shared-link helper
// takes the pathname as an argument, so this stand-in only has to exist.
globalThis.window = { location: { search: '', pathname: '/' } };

const { publicCollectionId, pathForPublicCollection, routeFromPath, pathForRoute } =
  await import('../src/utils/route.ts');

const SHARED_ID = 'a0000000-0000-0000-0000-000000000001';

test('a shared collection link is recognised by its id', () => {
  assert.equal(publicCollectionId(`/c/${SHARED_ID}`), SHARED_ID);
});

test('a trailing slash on a shared link still resolves', () => {
  assert.equal(publicCollectionId(`/c/${SHARED_ID}/`), SHARED_ID);
});

test('the app pages are not shared links', () => {
  for (const pathname of ['/', '/collections', '/pokedex', '/reports', '/settings']) {
    assert.equal(publicCollectionId(pathname), null, pathname);
  }
});

test('the Pokédex page has its own navigable address', () => {
  assert.equal(routeFromPath('/pokedex'), 'pokedex');
  assert.equal(pathForRoute('pokedex'), '/pokedex');
});

test('reports have a dedicated address, including a trailing slash', () => {
  assert.equal(routeFromPath('/reports/'), 'reports');
  assert.equal(pathForRoute('reports'), '/reports');
});

test('the card scanner has a dedicated address, including a trailing slash', () => {
  assert.equal(routeFromPath('/scanner/'), 'scanner');
  assert.equal(pathForRoute('scanner'), '/scanner');
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

test('opening cards from catalog filters notifies the panel even when the path stays the same', async () => {
  const { openCardsView, subscribeToCardsView } = await import('../src/utils/route.ts');
  const previousWindow = globalThis.window;
  let activePanel = 'filters';
  let calls = 0;
  const search = '?addCollection=leaf&markedCollections=Proyectos';
  const unsubscribe = subscribeToCardsView(() => { activePanel = 'cards'; calls++; });
  try {
    globalThis.window = { location: { pathname: '/', search } };
    openCardsView();
    assert.equal(activePanel, 'cards');
    assert.equal(window.location.search, search);
    assert.equal(calls, 1);
    activePanel = 'filters';
    openCardsView();
    assert.equal(activePanel, 'cards');
    assert.equal(calls, 2);
    unsubscribe();
    openCardsView();
    assert.equal(calls, 2);
  } finally { unsubscribe(); globalThis.window = previousWindow; }
});

test('opening cards from Collections preserves the chosen view and Add destination', async () => {
  const { openCardsView, subscribeToCardsView } = await import('../src/utils/route.ts');
  const previousWindow = globalThis.window;
  const location = { pathname: '/collections', search: '?viewMode=collection&viewedCollection=Binder&addCollection=leaf' };
  let opened = false;
  const unsubscribe = subscribeToCardsView(() => { opened = true; });
  try {
    globalThis.window = { location, history: { pushState(_state, _title, url) {
      const destination = new URL(url, 'https://dashboard.test');
      location.pathname = destination.pathname;
      location.search = destination.search;
    } } };
    openCardsView();
    assert.equal(location.pathname, '/');
    assert.equal(opened, true);
    assert.equal(location.search, '?viewMode=collection&viewedCollection=Binder&addCollection=leaf');
  } finally { unsubscribe(); globalThis.window = previousWindow; }
});
