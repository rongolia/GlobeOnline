import type { CountryDescription, CountrySymbol } from './countries';
import { flagEmoji } from './flags';

/**
 * Easy country dataset: 10 very well-known countries, each with three fun facts.
 *
 * Same shape as the full dataset in ./countries.ts. Keys (`name`) match the map
 * data / CountryInfo.name.
 *
 * The three facts run from the best known to the most obscure, and do different jobs.
 * The first is the CLUE: something most people could already tell you (the famous
 * landmark, the food, the animal), shown after the flag when the flag alone was not
 * enough. The second is a step past that, shown on the info cards. The third is the
 * REWARD: proper trivia, shown once the country has been found. The tuple type fixes the
 * count at three, so none can be left out by accident.
 *
 * As in the full dataset, no fact names its own country.
 *
 * The clue may name a landmark - it comes after the flag, as the helpful hint. The
 * reward is only ever shown once the answer is known, so it is free to be as obscure as
 * it likes; it is the surprise that makes finding the country worth it.
 */

// [map name, ISO numeric, display name, [well known (clue), lesser known, trivia (reward)]]
const ROWS: [string, string, string, [string, string, string]][] = [
  ['United States of America', '840', 'United States', [
    'Home to the Statue of Liberty and Hollywood.',
    'It has more airports than any other country, by a very wide margin.',
    'Its paper money is not paper at all - the notes are woven from cotton and linen.',
  ]],
  ['China', '156', 'China', [
    'Home to the Great Wall and giant pandas.',
    'Paper, printing, gunpowder and the compass were all invented here.',
    'The whole country keeps a single time zone, even though it is wide enough for five.',
  ]],
  ['Japan', '392', 'Japan', [
    'Famous for sushi, Mount Fuji and super-fast bullet trains.',
    'Made up of thousands of islands, and almost three-quarters of it is mountain and forest.',
    'There are more vending machines per person here than anywhere else on Earth.',
  ]],
  ['France', '250', 'France', [
    'Home to the Eiffel Tower and famous for croissants.',
    'The most visited country in the world, with around 100 million travellers a year.',
    'The metric system was worked out here in the 1790s, and most of the world now uses it.',
  ]],
  ['Italy', '380', 'Italy', [
    'Shaped like a boot, and the birthplace of pizza.',
    'Two of the smallest countries in the world sit entirely inside its borders.',
    'The piano, the thermometer and the electric battery were all invented here.',
  ]],
  ['Brazil', '076', 'Brazil', [
    'Famous for football, carnival and the Amazon rainforest.',
    'Portuguese is the everyday language here, which is true of none of its neighbours.',
    'Its capital was built from nothing in about four years, and from the air it is shaped like an aeroplane.',
  ]],
  ['Egypt', '818', 'Egypt', [
    'Home to the ancient pyramids and the Sphinx.',
    'Nearly everyone lives along one river, and desert covers almost all the rest.',
    'The 365-day calendar the world still runs on was first worked out here.',
  ]],
  ['India', '356', 'India', [
    'Home to the Taj Mahal, and more people live here than in any other country.',
    'There are 22 official languages, and banknotes are printed in more than a dozen of them.',
    'Chess and snakes and ladders were both invented here.',
  ]],
  ['Australia', '036', 'Australia', [
    'A country that is also a whole continent, home to kangaroos and koalas.',
    'Voting is required by law, and not turning up to an election earns you a fine.',
    'It drifts north about 7 cm a year, fast enough that the maps have to be redrawn.',
  ]],
  ['United Kingdom', '826', 'United Kingdom', [
    'Famous for Big Ben, red double-decker buses and the royal family.',
    'Made up of four nations, and nowhere in it is more than about 115 km from the sea.',
    'It has no single written constitution - the rules are spread over centuries of law and custom.',
  ]],
];

/**
 * Each country's emblem, where it has one - see CountryDescription.symbol for the bar it
 * has to clear. Countries missing from here have no single symbol that clearly fits.
 */
const SYMBOLS: Record<string, CountrySymbol> = {
  'United States of America': { emoji: '🗽', label: 'Statue of Liberty' },
  'China': { emoji: '🐼', label: 'Giant panda' },
  'Japan': { emoji: '🗻', label: 'Mount Fuji' },
  'France': { emoji: '🥐', label: 'Croissant' },
  'Italy': { emoji: '🍕', label: 'Pizza' },
  'Australia': { emoji: '🦘', label: 'Kangaroo' },
};

export const EASY_COUNTRY_DESCRIPTIONS: CountryDescription[] = ROWS.map(
  ([name, isoNumeric, displayName, funFacts]) => ({
    name,
    displayName,
    isoNumeric,
    flag: flagEmoji(isoNumeric),
    funFacts,
    symbol: SYMBOLS[name],
  })
);

const BY_NAME = new Map(EASY_COUNTRY_DESCRIPTIONS.map((d) => [d.name.toLowerCase(), d]));

/** Looks up a country in the easy set by its map name (case-insensitive). */
export function getEasyCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}
