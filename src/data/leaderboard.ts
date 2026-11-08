/**
 * The leaderboard dataset: one record per finished game, holding only what the server
 * needs - the player's three-letter name and their score.
 *
 * There is no server yet, so records are kept in this browser's localStorage, highest
 * score first, ready to go. When there is an endpoint, sending them is:
 *
 *   await fetch(url, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: getScoreDatasetJson(),
 *   });
 *   clearScoreDataset();
 *
 * The body is a JSON array of { "name": "ABC", "score": 42 }.
 *
 * Storage can be unavailable (private windows, blocked site data). Every access is
 * guarded, and a record that cannot be kept is simply dropped rather than getting in
 * the way of the game.
 */

/** Names are arcade-style initials: exactly this many letters, A-Z. */
export const NAME_LENGTH = 3;

/** One leaderboard record, exactly as the server receives it. */
export interface ScoreRecord {
  /** Three capital letters, A-Z. */
  name: string;
  /** Whole points, zero or more. */
  score: number;
}

const STORAGE_KEY = 'globe-online:leaderboard';
const NAME_PATTERN = new RegExp(`^[A-Z]{${NAME_LENGTH}}$`);

/** Typed text -> a valid name in progress: capitals only, A-Z, at most NAME_LENGTH. */
export function cleanName(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, NAME_LENGTH);
}

/**
 * Builds a record, or returns null if it would not be valid to send. Anything extra a
 * caller has is deliberately left out: the record is the name and the score, nothing else.
 */
export function toScoreRecord(name: string, score: number): ScoreRecord | null {
  if (!NAME_PATTERN.test(name)) return null;
  if (!Number.isInteger(score) || score < 0) return null;
  return { name, score };
}

/**
 * Every record kept so far, highest score first. Reading also cleans the data: any stored
 * entry that is not a valid record is skipped, and extra fields (older builds stored the
 * difficulty and a date too) are stripped, so what comes back is always safe to send.
 */
export function getScoreDataset(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => (e && typeof e === 'object' ? toScoreRecord((e as ScoreRecord).name, (e as ScoreRecord).score) : null))
      .filter((r): r is ScoreRecord => r !== null)
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

/** The dataset as the JSON request body for the server. */
export function getScoreDatasetJson(): string {
  return JSON.stringify(getScoreDataset());
}

/** Adds a finished game. Returns false if the record was invalid or could not be kept. */
export function addScore(name: string, score: number): boolean {
  const record = toScoreRecord(name, score);
  if (!record) return false;
  try {
    const records = [...getScoreDataset(), record].sort((a, b) => b.score - a.score);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** Empties the dataset, e.g. once it has been sent. */
export function clearScoreDataset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, or nothing reachable: either way there is nothing to clear.
  }
}
