/**
 * Leaderboard dataset connected to Firebase Firestore.
 * Every score is stored; the leaderboard shows the highest 10 of them.
 */

import {
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  where,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

/** Names are arcade-style initials: exactly 3 letters, A-Z. */
export const NAME_LENGTH = 3;

/** Maximum number of records kept in the database. */
export const MAX_LEADERBOARD_RECORDS = 10;

export interface ScoreRecord {
  id?: string;
  name: string;
  score: number;
  createdAt?: string | number | null;
}

const STORAGE_KEY = 'globe-online:leaderboard';
const NAME_PATTERN = new RegExp(`^[A-Z]{${NAME_LENGTH}}$`);

/** Cleans user input to uppercase 3 letters max */
export function cleanName(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, NAME_LENGTH);
}

/** Validates and formats a score record */
export function toScoreRecord(name: string, score: number, id?: string): ScoreRecord | null {
  if (!NAME_PATTERN.test(name)) return null;
  if (!Number.isInteger(score) || score < 0) return null;
  return { id, name, score };
}

/** Local storage backup helper */
export function getLocalScores(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => (e && typeof e === 'object' ? toScoreRecord((e as ScoreRecord).name, (e as ScoreRecord).score) : null))
      .filter((r): r is ScoreRecord => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_LEADERBOARD_RECORDS);
  } catch {
    return [];
  }
}

/** Saves backup copy to local storage */
function saveLocalScore(name: string, score: number): void {
  try {
    const record = toScoreRecord(name, score);
    if (!record) return;
    const current = getLocalScores();
    const updated = [...current, record].sort((a, b) => b.score - a.score).slice(0, MAX_LEADERBOARD_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage issues
  }
}

/**
 * Subscribes to real-time top 10 leaderboard changes from Firestore.
 * Automatically falls back to local storage if Firestore connection is unavailable.
 */
export function subscribeTopScores(
  onUpdate: (scores: ScoreRecord[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const scoresRef = collection(db, 'scores');
    const q = query(scoresRef, orderBy('score', 'desc'), limit(MAX_LEADERBOARD_RECORDS));

    return onSnapshot(
      q,
      (snapshot) => {
        const scores: ScoreRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const record = toScoreRecord(data.name, data.score, docSnap.id);
          if (record) {
            scores.push({
              ...record,
              createdAt: data.createdAt?.toMillis?.() || Date.now(),
            });
          }
        });
        onUpdate(scores);
      },
      (error) => {
        console.warn('Real-time leaderboard listener error, falling back to local cache:', error);
        if (onError) onError(error);
        onUpdate(getLocalScores());
      }
    );
  } catch (err) {
    console.warn('Could not initialize snapshot listener:', err);
    onUpdate(getLocalScores());
    return () => {};
  }
}

/**
 * Fetches the current top 10 scores from Firestore.
 */
export async function getTopScores(): Promise<ScoreRecord[]> {
  try {
    const scoresRef = collection(db, 'scores');
    const q = query(scoresRef, orderBy('score', 'desc'), limit(MAX_LEADERBOARD_RECORDS));
    const snapshot = await getDocs(q);
    const scores: ScoreRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const record = toScoreRecord(data.name, data.score, docSnap.id);
      if (record) {
        scores.push({
          ...record,
          createdAt: data.createdAt?.toMillis?.() || null,
        });
      }
    });
    return scores;
  } catch (error) {
    console.warn('Failed to fetch from Firestore, falling back to local scores:', error);
    return getLocalScores();
  }
}

/**
 * Sends the name and score to the database.
 *
 * Every score is kept; "top 10" is a query (orderBy score, limit 10), not a cap on the
 * collection. Trimming from the browser would need clients to be allowed to delete
 * scores, and anything a browser may do, anyone may do - so the rules forbid deletes
 * and nothing here attempts one.
 *
 * `rank` is the new score's place in the top 10, found by its own document id - not by
 * matching name and score, which would pick out an older identical entry instead.
 * Undefined when it did not make the top 10. `id` is the new score's document id.
 *
 * `position` is where the score stands overall, top 10 or not: one more than the number
 * of scores strictly above it, so a tie shares the better place. It is a count query, so
 * it costs one read however long the board gets. Undefined if that count could not be
 * made - the score is saved either way.
 */
export async function saveScoreToFirestore(
  name: string,
  score: number
): Promise<{ success: boolean; id?: string; rank?: number; position?: number; isTop10?: boolean; error?: string }> {
  const clean = cleanName(name);
  const validated = toScoreRecord(clean, score);
  if (!validated) {
    return { success: false, error: 'Invalid name or score format' };
  }

  // Always keep local storage backup
  saveLocalScore(clean, score);

  try {
    const scoresRef = collection(db, 'scores');
    const added = await addDoc(scoresRef, {
      name: clean,
      score,
      createdAt: serverTimestamp(),
    });

    const top = await getDocs(query(scoresRef, orderBy('score', 'desc'), limit(MAX_LEADERBOARD_RECORDS)));
    const index = top.docs.findIndex((d) => d.id === added.id);

    let position: number | undefined;
    if (index >= 0) {
      position = index + 1;
    } else {
      try {
        const above = await getCountFromServer(query(scoresRef, where('score', '>', score)));
        position = above.data().count + 1;
      } catch (error) {
        console.warn('[Firestore] Could not count the scores above this one:', error);
      }
    }

    return {
      success: true,
      id: added.id,
      rank: index >= 0 ? index + 1 : undefined,
      position,
      isTop10: index >= 0,
    };
  } catch (error) {
    console.error('[Firestore] Could not save score:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database error',
    };
  }
}

export function clearScoreDataset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
