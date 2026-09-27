import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  applyPokedexProject, parsePokedexProjects, projectFromGrouping,
  readPokedexProjects, writePokedexProjects, POKEDEX_PRESETS,
} = await import('../src/services/pokedexProjects.ts');
const { formBelongsToRegions } = await import('../src/utils/pokedexRegions.ts');

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
  assert.equal(restored.enabled, false);
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
  assert.equal(readPokedexProjects('user-b').projects.length, POKEDEX_PRESETS.length);
});

test('new accounts start with a national project and regional and cumulative presets', () => {
  const state = readPokedexProjects('new-user');
  assert.equal(state.activeId, 'preset-national-1025');
  assert.deepEqual(state.projects.find((project) => project.id === state.activeId).groupingRegions, ['All']);
  assert.equal(state.projects.length, 20);
  assert.deepEqual(state.projects.find((project) => project.id === 'preset-kanto-to-galar').groupingRegions,
    ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar']);
});

test('existing projects gain presets without losing their active selection or restoring deleted presets', () => {
  const state = { projects: [projectFromGrouping('one', 'Kanto Mega', grouping)], activeId: 'one' };
  window.localStorage.setItem('pokedashboard:pokedex-projects:older-user', JSON.stringify(state));
  const migrated = readPokedexProjects('older-user');
  assert.equal(migrated.activeId, 'one');
  assert.equal(migrated.projects.length, 21);
  writePokedexProjects('older-user', { ...migrated, projects: migrated.projects.filter((project) => project.id !== 'preset-region-kanto') });
  assert.equal(readPokedexProjects('older-user').projects.length, 20);
});

test('regional membership uses national species number for form choices', () => {
  const rotom = { number: 479, regions: [{ region: { name: 'Kanto' } }] };
  assert.equal(formBelongsToRegions(rotom, ['Kanto']), false);
  assert.equal(formBelongsToRegions(rotom, ['Sinnoh']), true);
  assert.equal(formBelongsToRegions(rotom, ['Kanto', 'Johto', 'Hoenn', 'Sinnoh']), true);
});
