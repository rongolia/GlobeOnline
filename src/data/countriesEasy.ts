import type { CountryDescription } from './countries';
import { flagEmoji } from './flags';

/**
 * Easy country dataset: 10 very well-known countries, each with three fun facts.
 *
 * Same shape as the full dataset in ./countries.ts. Keys (`name`) match the map
 * data / CountryInfo.name.
 *
 * The three facts run from the best known to the most obscure: the first is something
 * most people could already tell you (the famous landmark, the food, the animal), the
 * second is a step past that, and the third is proper trivia. The tuple type fixes the
 * count at three, so the progression cannot be half-filled in by accident.
 *
 * As in the full dataset, no fact names its own country.
 *
 * ONLY THE FIRST FACT MAY NAME A PLACE OR A LANDMARK. The game runs this ladder
 * backwards - it opens on the third fact and falls back towards the first - so a
 * landmark in the second or third gives the country away on the clue that was meant to
 * be the challenge. "Home to the Great Wall" is a fine first fact and a useless third
 * one. Keep the later two to things a country does, makes, or is like, with no named
 * mountain, river, city, building, region or neighbouring country in them.
 */

// [map name, ISO numeric, display name, [well known, lesser known, trivia]]
// Only the first of the three may name a place or landmark - see above.
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

export const EASY_COUNTRY_DESCRIPTIONS: CountryDescription[] = ROWS.map(
  ([name, isoNumeric, displayName, funFacts]) => ({
    name,
    displayName,
    isoNumeric,
    flag: flagEmoji(isoNumeric),
    funFacts,
  })
);

const BY_NAME = new Map(EASY_COUNTRY_DESCRIPTIONS.map((d) => [d.name.toLowerCase(), d]));

/** Looks up a country in the easy set by its map name (case-insensitive). */
export function getEasyCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}
