import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for just enough of the browser: the query string, localStorage, and the
// display-mode media query that tells an installed launch from a browser tab.
let store = {};
let installed = false;

globalThis.window = {
  location: { search: '', pathname: '/' },
  history: {
    replaceState: (_state, _title, url) => {
      globalThis.window.location.search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    },
  },
  localStorage: {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
  },
  matchMedia: (query) => ({ matches: installed && query.includes('standalone') }),
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

const { rememberUrl, restoreLaunchUrl, clearRememberedUrl } = await import('../src/services/launchUrl.ts');

const launch = (search) => { window.location.search = search; };

beforeEach(() => {
  store = {};
  installed = false;
  launch('');
  clearRememberedUrl();
});

test('an installed launch returns to where it was left', () => {
  launch('?series=Base&order=Price_↓');
  rememberUrl();

  installed = true;
  launch('');
  restoreLaunchUrl();

  assert.equal(window.location.search, '?series=Base&order=Price_↓');
});

test('a browser tab opened at the bare address stays clean', () => {
  launch('?series=Base');
  rememberUrl();

  // Not installed: typing the address is a request for a clean slate, and restoring
  // yesterday's filters there would be the opposite of what was asked.
  installed = false;
  launch('');
  restoreLaunchUrl();

  assert.equal(window.location.search, '');
});

test('a launch that carries its own parameters wins over what was remembered', () => {
  launch('?series=Base');
  rememberUrl();

  installed = true;
  launch('?viewMode=collection&viewedCollection=Hits');
  restoreLaunchUrl();

  assert.equal(window.location.search, '?viewMode=collection&viewedCollection=Hits',
    'a shared link must not be overwritten by the last session');
});

test('nothing remembered means the app opens on the catalog', () => {
  installed = true;
  launch('');
  restoreLaunchUrl();
  assert.equal(window.location.search, '');
});

test('a remembered empty state does not become a stray question mark', () => {
  launch('');
  rememberUrl();
  installed = true;
  restoreLaunchUrl();
  assert.equal(window.location.search, '');
});

test('the latest state is the one remembered', () => {
  launch('?series=Base');
  rememberUrl();
  launch('?series=Base&set=Evolving_Skies');
  rememberUrl();

  installed = true;
  launch('');
  restoreLaunchUrl();

  assert.equal(window.location.search, '?series=Base&set=Evolving_Skies');
});

test('storage that refuses to write does not take the app down', () => {
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  launch('?series=Base');
  assert.doesNotThrow(rememberUrl);
  window.localStorage.setItem = original;
});
