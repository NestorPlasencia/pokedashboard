import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardsWithEvolutionFamilyRegions, formBelongsToRegions,
  getPokedexRegion, pokedexNumbersInRegion,
} from '../src/utils/pokedexRegions.ts';
import { applyFormsFilter, excludeCardsByProperty, filterCardsByProperty } from '../src/utils/filters.ts';
import { compareEvolutionaryPokedexNumbers as compare } from '../src/utils/pokedexEvolution.ts';

test('Johto uses family origin in evolutionary mode, including later evolutions and excluding Kanto families', () => {
  const johto = [152, 153, 154, 175, 176, 468, 193, 469, 220, 221, 473, 234, 899, 206, 982];
  const kanto = [172, 25, 26, 41, 42, 169, 95, 208, 133, 196, 197, 470, 471, 700, 439, 122, 866];
  for (const number of johto) {
    assert.equal(formBelongsToRegions({ number }, ['Johto'], true), true, `Johto family #${number}`);
    assert.equal(formBelongsToRegions({ number }, ['Kanto'], true), false, `not Kanto #${number}`);
  }
  for (const number of kanto) {
    assert.equal(formBelongsToRegions({ number }, ['Johto'], true), false, `not Johto #${number}`);
    assert.equal(formBelongsToRegions({ number }, ['Kanto'], true), true, `Kanto family #${number}`);
  }
  assert.equal(getPokedexRegion(172), 'Johto');
  assert.equal(getPokedexRegion(468), 'Sinnoh');
  assert.equal(getPokedexRegion(172, true), 'Kanto');
  assert.equal(getPokedexRegion(468, true), 'Johto');
});

test('catalog region includes and excludes agree with evolutionary families without altering the source', () => {
  const numbers = [172, 25, 169, 175, 468, 193, 469, 220, 473];
  const source = numbers.map((number) => ({
    id: String(number), nationalPokedexNumbers: [number], pokedexRegion: getPokedexRegion(number),
  }));
  const cards = cardsWithEvolutionFamilyRegions(source);
  assert.deepEqual(filterCardsByProperty(cards, 'pokedexRegion', ['Johto']).map((card) => Number(card.id)),
    [175, 468, 193, 469, 220, 473]);
  assert.deepEqual(excludeCardsByProperty(cards, 'pokedexRegion', ['Johto']).map((card) => Number(card.id)),
    [172, 25, 169]);
  assert.deepEqual(source.map((card) => card.pokedexRegion), numbers.map((number) => getPokedexRegion(number)));
  assert.equal(source[0].pokedexRegion, 'Johto');
  assert.equal(cards[0].pokedexRegion, 'Kanto');
  assert.deepEqual(filterCardsByProperty(source, 'pokedexRegion', ['Johto']).map((card) => Number(card.id)),
    [172, 169, 175, 193, 220]);
});

const form = (number) => ({
  id: number, number, name: `Pokemon ${number}`, pokemonId: number, image: '',
  isDefault: true, variants: [], regions: [], pokemon: { name: `Pokemon ${number}` },
});
const grouping = {
  filterByCollection: 'all', groupingRegions: ['Johto'], evolutionaryRegions: true,
  allowVariants: ['Default'], hideVariants: [], excludedFormIds: [],
  selectedCollections: [], collectionMode: 'none', fallbackToDefault: false,
};

test('group filtering includes the same Johto family for actual cards and missing-form placeholders', () => {
  const forms = [172, 25, 26, 175, 176, 468, 193, 469].map(form);
  const cards = [172, 175, 468, 469].map((number) => ({
    id: String(number), nationalPokedexNumbers: [number], pokemonForms: [`Pokemon ${number}`],
  }));
  const result = applyFormsFilter(cards, forms, grouping);
  assert.deepEqual(result.filter((item) => !item.isPlaceholder).map((card) => Number(card.id)), [175, 468, 469]);
  assert.deepEqual(result.filter((item) => item.isPlaceholder).map((placeholder) => placeholder.pokemonNumber), [176, 193]);
  assert.ok(result.filter((item) => item.isPlaceholder).every((item) => item.regionName === 'Johto'));
  // Explicit form exclusions and ordinary Pokédex filtering still work.
  const excluded = applyFormsFilter(cards, forms, { ...grouping, excludedFormIds: [468] });
  assert.ok(excluded.every((item) => item.id !== '468' && item.pokemonNumber !== 468));
  const national = applyFormsFilter(cards, forms, { ...grouping, evolutionaryRegions: false });
  assert.deepEqual(national.filter((item) => !item.isPlaceholder).map((card) => Number(card.id)), [172, 175]);
});

test('a regional Pokédex without any cards still includes its complete evolution families in order', () => {
  const forms = [172, 25, 175, 176, 468].map(form);
  const result = applyFormsFilter([], forms, grouping);
  assert.deepEqual(result.map((item) => item.pokemonNumber).sort(compare), [175, 176, 468]);
  assert.ok(result.every((item) => item.isPlaceholder));
});

test('evolutionary regional totals partition the entire Pokédex and multi-region selection keeps whole families', () => {
  const names = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea'];
  const numbers = names.flatMap((name) => pokedexNumbersInRegion(name, true));
  assert.equal(numbers.length, 1025);
  assert.equal(new Set(numbers).size, 1025);
  assert.equal(pokedexNumbersInRegion('Kanto').length, 151);
  assert.equal(pokedexNumbersInRegion('Johto').length, 100);
  assert.ok(pokedexNumbersInRegion('Johto', true).includes(468));
  assert.ok(!pokedexNumbersInRegion('Johto', true).includes(172));
  assert.ok(formBelongsToRegions({ number: 468 }, ['Kanto', 'Johto'], true));
  assert.ok(formBelongsToRegions({ number: 700 }, ['Kanto', 'Johto'], true));
  assert.ok(formBelongsToRegions({ number: 468 }, ['All'], true));
  assert.ok(formBelongsToRegions({ number: 468 }, [], true));
});
