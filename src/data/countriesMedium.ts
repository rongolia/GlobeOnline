import type { CountryDescription, CountrySymbol } from './countries';
import { flagEmoji } from './flags';

/**
 * Medium country dataset: 10 countries most people could place on a map, but that are a
 * step less iconic than the easy set.
 *
 * Same shape and same rules as ./countriesEasy.ts, which is the reference for how a
 * group is built. In short:
 *
 * Three facts, best known to most obscure: the first is the well-known CLUE, shown
 * after the flag; the second is a lesser-known fact, shown on the info cards; the third
 * is the trivia REWARD, shown once the country is found. The tuple type fixes the count
 * at three. No fact names its own country.
 *
 * Countries are also picked to be findable: each is a big enough target to catch a
 * parachute on, and far enough from the poles that a beacon can always be reached.
 */

// [map name, ISO numeric, display name, [well known (clue), lesser known, trivia (reward)]]
const ROWS: [string, string, string, [string, string, string]][] = [
  ['Canada', '124', 'Canada', [
    'Home to Niagara Falls, maple syrup and ice hockey.',
    'It holds more lakes inside its borders than the rest of the world put together.',
    'Its one-dollar coin is nicknamed after the diving bird stamped on it.',
  ]],
  ['Mexico', '484', 'Mexico', [
    'Famous for tacos, mariachi music and the Day of the Dead.',
    'Chocolate, chillies and the tomato were all first grown here.',
    'The bright red flower people buy at midwinter grows wild here as a shrub.',
  ]],
  ['Germany', '276', 'Germany', [
    'Famous for fairy-tale castles, sausages and motorways with no speed limit.',
    'About a third of the land is forest, and anyone is free to walk in it.',
    'The petrol car and the aspirin tablet were both invented here.',
  ]],
  ['Spain', '724', 'Spain', [
    'Famous for flamenco, paella and running with bulls.',
    'Lunch is often eaten at three in the afternoon and dinner after nine at night.',
    'Its clocks were moved an hour out of step with the sun in the 1940s and never moved back.',
  ]],
  ['Russia', '643', 'Russia', [
    'Famous for nesting dolls, ballet and bitterly cold winters.',
    'It is wide enough to cover eleven separate time zones.',
    'One lake here holds about a fifth of all the unfrozen fresh water on the planet.',
  ]],
  ['Argentina', '032', 'Argentina', [
    'Famous for tango, football and huge cattle ranches.',
    'It runs so far from end to end that it has both subtropical forest and polar ice.',
    'The ballpoint pen was made to work properly here by an immigrant inventor.',
  ]],
  ['South Africa', '710', 'South Africa', [
    'Famous for safari animals, diamonds and Nelson Mandela.',
    'It has three capital cities, one each for government, law and parliament.',
    'There are more than ten official languages, and the anthem moves through five of them.',
  ]],
  ['Turkey', '792', 'Turkey', [
    'Famous for kebabs, bazaars and a city that stands on two continents.',
    'About three-quarters of the hazelnuts eaten in the world are grown here.',
    'Tulips were being cultivated here long before they reached the gardens they made famous.',
  ]],
  ['Indonesia', '360', 'Indonesia', [
    'Famous for rainforests, orangutans and more than seventeen thousand islands.',
    'More active volcanoes rise here than in any other country.',
    'A flower grows here a metre across that smells of rotting meat.',
  ]],
  ['Thailand', '764', 'Thailand', [
    'Famous for golden temples, spicy curries and tuk-tuks.',
    'It is the only country in its part of the world never taken over by a foreign empire.',
    'Its capital holds the longest official city name in the world, at 168 letters.',
  ]],
];

/**
 * Each country's emblem, where it has one - see CountryDescription.symbol for the bar it
 * has to clear. Countries missing from here have no single symbol that clearly fits.
 */
const SYMBOLS: Record<string, CountrySymbol> = {
  'Canada': { emoji: '🍁', label: 'Maple leaf' },
  'Mexico': { emoji: '🌮', label: 'Taco' },
  'Germany': { emoji: '🥨', label: 'Pretzel' },
  'Spain': { emoji: '🥘', label: 'Paella' },
  'Russia': { emoji: '🪆', label: 'Nesting doll' },
};

export const MEDIUM_COUNTRY_DESCRIPTIONS: CountryDescription[] = ROWS.map(
  ([name, isoNumeric, displayName, funFacts]) => ({
    name,
    displayName,
    isoNumeric,
    flag: flagEmoji(isoNumeric),
    funFacts,
    symbol: SYMBOLS[name],
  })
);

const BY_NAME = new Map(MEDIUM_COUNTRY_DESCRIPTIONS.map((d) => [d.name.toLowerCase(), d]));

/** Looks up a country in the medium set by its map name (case-insensitive). */
export function getMediumCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}
