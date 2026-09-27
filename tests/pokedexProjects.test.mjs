import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  applyPokedexProject, parsePokedexProjects, projectFromGrouping,
  readPokedexProjects, writePokedexProjects,
} = await import('../src/services/pokedexProjects.ts');

const grouping = {
  enabled: false,
  filterByCollection: 'all',
  groupingRegions: ['Kanto'],
  allowVariants: ['Default', 'Mega'],
  hideVariants: [],
  excludedFormIds: [42],
  groupSortBy: 'default',
  fallbackToDefault: true,
};

test('a project restores the same form universe without changing collection controls', () => {
  const project = projectFromGrouping('one', 'Kanto Mega', grouping);
  const restored = applyPokedexProject({
    ...grouping,
    filterByCollection: 'notOwned',
    groupingRegions: ['All'],
    excludedFormIds: [],
  }, project);
  assert.equal(restored.enabled, true);
  assert.deepEqual(restored.groupingRegions, ['Kanto']);
  assert.deepEqual(restored.allowVariants, ['Default', 'Mega']);
  assert.deepEqual(restored.excludedFormIds, [42]);
  assert.equal(restored.filterByCollection, 'notOwned');
});

test('project files reject invalid form IDs and keep a valid active project', () => {
  const project = projectFromGrouping('one', 'Kanto Mega', grouping);
  assert.equal(parsePokedexProjects({ projects: [project], activeId: 'one' }).activeId, 'one');
  assert.throws(() => parsePokedexProjects({
    projects: [{ ...project, excludedFormIds: ['42'] }], activeId: 'one',
  }));
});

test('saved projects stay separate for each account on the same device', () => {
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    },
  };
  const state = { projects: [projectFromGrouping('one', 'Kanto Mega', grouping)], activeId: 'one' };
  writePokedexProjects('user-a', state);
  assert.equal(readPokedexProjects('user-a').projects.length, 1);
  assert.equal(readPokedexProjects('user-b').projects.length, 0);
});
