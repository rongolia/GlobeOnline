import type { CountryDescription, CountrySymbol } from './countries';
import { flagEmoji } from './flags';

/**
 * Hard country dataset: 10 countries that are rarely anyone's first guess.
 *
 * Same shape and same rules as ./countriesEasy.ts, which is the reference for how a
 * group is built. In short:
 *
 * Three facts, best known to most obscure: the first is the well-known CLUE, shown
 * after the flag; the second is a lesser-known fact, shown on the info cards; the third
 * is the trivia REWARD, shown once the country is found. The tuple type fixes the count
 * at three. No fact names its own country.
 *
 * Hard means hard to NAME, not hard to hit. Every country here is still a large target
 * - all of them bigger than the smallest country in the easy set - and none sits far
 * enough from the equator to put a beacon out of reach. A country nobody can name and
 * nobody can land on would just be a wasted life.
 */

// [map name, ISO numeric, display name, [well known (clue), lesser known, trivia (reward)]]
const ROWS: [string, string, string, [string, string, string]][] = [
  ['Kazakhstan', '398', 'Kazakhstan', [
    'The largest country on Earth with no coast at all, mostly open grassland.',
    'Rockets have been launched into space from its desert for more than sixty years.',
    'The apple is thought to have come first from its mountain forests.',
  ]],
  ['Mongolia', '496', 'Mongolia', [
    'Famous for vast grasslands, horse riding and round felt tents.',
    'Fewer people live in each square kilometre here than in any other country.',
    'Roughly a quarter of its people still herd animals and move camp with the seasons.',
  ]],
  ['Bolivia', '068', 'Bolivia', [
    'Home to the largest salt flat in the world, a white plain you can see from space.',
    'It has two capitals, and its seat of government is the highest of any country.',
    'A lake it shares is the highest in the world that large boats can sail on.',
  ]],
  ['Madagascar', '450', 'Madagascar', [
    'A huge island famous for lemurs and wide-trunked baobab trees.',
    'About nine in ten of its plants and animals live nowhere else on Earth.',
    'It broke away from the mainland some 160 million years ago and has been alone since.',
  ]],
  ['Mali', '466', 'Mali', [
    'A desert country that was once home to one of the richest empires in history.',
    'Its great mud-brick mosques are replastered by hand every single year.',
    'A library of ancient manuscripts here was smuggled to safety a book at a time.',
  ]],
  ['Zambia', '894', 'Zambia', [
    'Home to one of the widest waterfalls in the world, shared with its neighbour.',
    'Copper is dug here in such quantity that the trade shaped the whole country.',
    'Nearly a third of its land is set aside as parks and reserves for wildlife.',
  ]],
  ['Myanmar', '104', 'Myanmar', [
    'Famous for thousands of golden temples standing together on a dusty plain.',
    'Almost all of the finest rubies in the world are dug from one valley here.',
    'Its clocks are set half an hour out of step with the zones on either side.',
  ]],
  ['Uzbekistan', '860', 'Uzbekistan', [
    'A desert country on the old Silk Road, famous for blue-tiled domes.',
    'It is one of only two countries you must cross two borders to carry anything to the sea.',
    'An inland sea here shrank to a tenth of its size, leaving ships stranded on sand.',
  ]],
  ['Namibia', '516', 'Namibia', [
    'Home to the oldest desert on Earth, where the dunes glow orange at sunrise.',
    'It was among the first countries anywhere to write the protection of nature into its constitution.',
    'Some of the loneliest shipwrecks anywhere sit rusting along its fog-bound coast.',
  ]],
  ['Papua New Guinea', '598', 'Papua New Guinea', [
    'A mountainous tropical country sharing one of the largest islands on Earth.',
    'More languages are spoken here than in any other country - over eight hundred of them.',
    'Birds of paradise live in its forests, and one of them stands on its flag.',
  ]],
];

/**
 * Each country's emblem, where it has one - see CountryDescription.symbol for the bar it
 * has to clear. Countries missing from here have no single symbol that clearly fits.
 */
const SYMBOLS: Record<string, CountrySymbol> = {
};

export const HARD_COUNTRY_DESCRIPTIONS: CountryDescription[] = ROWS.map(
  ([name, isoNumeric, displayName, funFacts]) => ({
    name,
    displayName,
    isoNumeric,
    flag: flagEmoji(isoNumeric),
    funFacts,
    symbol: SYMBOLS[name],
  })
);

const BY_NAME = new Map(HARD_COUNTRY_DESCRIPTIONS.map((d) => [d.name.toLowerCase(), d]));

/** Looks up a country in the hard set by its map name (case-insensitive). */
export function getHardCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}
