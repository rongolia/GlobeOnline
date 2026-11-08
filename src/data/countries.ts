/**
 * The country dictionary: every group, combined.
 *
 * Everything the app knows about a country comes from ./countriesEasy.ts,
 * ./countriesMedium.ts, ./countriesHard.ts or ./countriesImpossible.ts, and this module
 * is the one place that stitches them together.
 *
 * The first three are hand-written, three facts each, and are what the game plays with.
 * The impossible group is the long tail: every other country the map draws, with a single
 * fact each, so that nothing on the globe is a blank.
 *
 * Keys are the country names exactly as they appear in the map data (world-atlas
 * `countries-110m`), i.e. the same `name` the scene reports in CountryInfo - so
 * `getCountryDescription(country.name)` works directly.
 *
 * The groups import `CountryDescription` from here with `import type`, which is erased at
 * compile time, so there is no import cycle at runtime: this module depends on them and
 * nothing depends back.
 */

import { EASY_COUNTRY_DESCRIPTIONS } from './countriesEasy';
import { MEDIUM_COUNTRY_DESCRIPTIONS } from './countriesMedium';
import { HARD_COUNTRY_DESCRIPTIONS } from './countriesHard';
import { IMPOSSIBLE_COUNTRY_DESCRIPTIONS } from './countriesImpossible';

export interface CountryDescription {
  /** Name as used by the map data / CountryInfo.name (lookup key). */
  name: string;
  /** Friendlier full name for display. */
  displayName: string;
  /** ISO 3166-1 numeric code (also the map feature id). */
  isoNumeric: string;
  /** Flag emoji, or '' for the few territories with no ISO alpha-2 code. */
  flag: string;
  /**
   * Fun facts, best known first. The first is the CLUE: well known, shown after the flag
   * when the flag alone was not enough. The easy, medium and hard groups give exactly
   * three: the clue, a lesser-known fact, and the REWARD - proper trivia, shown once the
   * country has been found. The impossible group gives one, the clue, and so has no
   * reward.
   *
   * None of them names the country itself.
   */
  funFacts: string[];
  /**
   * The one thing the country is best known for, when that thing is both unmistakable
   * and uncontroversial and has an emoji of its own: a pizza, a maple leaf, a kangaroo.
   * Left out wherever no single symbol clearly fits, rather than stretched to cover it -
   * a vague or shared symbol would mislead more than it helps. Not shown anywhere yet.
   */
  symbol?: CountrySymbol;
}

/** A country's emblem: its emoji and a short name for it (also the accessible label). */
export interface CountrySymbol {
  emoji: string;
  label: string;
}

/** Which group a country belongs to. Each country is in exactly one. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';

/** The groups in order, hardest last. Iterating this is what builds the dictionary. */
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'impossible'];

/** The groups, keyed by difficulty, in the order a player meets them. */
export const COUNTRY_GROUPS: Record<Difficulty, CountryDescription[]> = {
  easy: EASY_COUNTRY_DESCRIPTIONS,
  medium: MEDIUM_COUNTRY_DESCRIPTIONS,
  hard: HARD_COUNTRY_DESCRIPTIONS,
  impossible: IMPOSSIBLE_COUNTRY_DESCRIPTIONS,
};

/** Every country the app knows about, in group order. */
export const COUNTRY_DESCRIPTIONS: CountryDescription[] = DIFFICULTIES.flatMap(
  (difficulty) => COUNTRY_GROUPS[difficulty]
);

const BY_NAME = new Map<string, CountryDescription>();
const DIFFICULTY_BY_NAME = new Map<string, Difficulty>();
for (const difficulty of DIFFICULTIES) {
  for (const d of COUNTRY_GROUPS[difficulty]) {
    const key = d.name.toLowerCase();
    // A country belongs to one group. If one is ever listed twice the first group wins,
    // so a duplicate quietly changes nothing rather than overwriting a tuned entry.
    if (BY_NAME.has(key)) continue;
    BY_NAME.set(key, d);
    DIFFICULTY_BY_NAME.set(key, difficulty);
  }
}

/** Looks a country up across all three groups by its map name (case-insensitive). */
export function getCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** Which group a country is in, or undefined if it is in none of them. */
export function getCountryDifficulty(name: string): Difficulty | undefined {
  return DIFFICULTY_BY_NAME.get(name.trim().toLowerCase());
}
