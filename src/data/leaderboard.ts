/**
 * Leaderboard dataset connected to Firebase Firestore.
 * Maintains the highest 10 records in the database.
 */

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

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
 * Sends the name and score to the database and updates it.
 * Enforces that the database ONLY keeps the highest 10 records by pruning any
 * documents beyond the 10th highest.
 */
export async function saveScoreToFirestore(
  name: string,
  score: number
): Promise<{ success: boolean; rank?: number; isTop10?: boolean; error?: string }> {
  const clean = cleanName(name);
  const validated = toScoreRecord(clean, score);
  if (!validated) {
    return { success: false, error: 'Invalid name or score format' };
  }

  // Always keep local storage backup
  saveLocalScore(clean, score);

  try {
    const scoresRef = collection(db, 'scores');

    // 1. Add the new score record to Firestore
    await addDoc(scoresRef, {
      name: clean,
      score,
      createdAt: serverTimestamp(),
    });

    // 2. Fetch all scores ordered by score descending to prune anything beyond the top 10
    const allQuery = query(scoresRef, orderBy('score', 'desc'));
    const allDocsSnap = await getDocs(allQuery);

    let rank = 1;
    let foundRank = false;

    // Prune excess records so the database ONLY stores the highest 10
    if (allDocsSnap.docs.length > MAX_LEADERBOARD_RECORDS) {
      const docsToDelete = allDocsSnap.docs.slice(MAX_LEADERBOARD_RECORDS);
      await Promise.all(
        docsToDelete.map((docItem) => deleteDoc(doc(db, 'scores', docItem.id)))
      );
    }

    // Determine the rank of the current score in the updated list
    for (let i = 0; i < Math.min(allDocsSnap.docs.length, MAX_LEADERBOARD_RECORDS); i++) {
      const data = allDocsSnap.docs[i].data();
      if (!foundRank && data.name === clean && data.score === score) {
        rank = i + 1;
        foundRank = true;
      }
    }

    return {
      success: true,
      rank: foundRank ? rank : undefined,
      isTop10: rank <= MAX_LEADERBOARD_RECORDS,
    };
  } catch (error) {
    console.error('Error saving score to Firestore:', error);
    try {
      handleFirestoreError(error, OperationType.CREATE, 'scores');
    } catch {
      // Return structured response
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Database error',
    };
  }
}

/** Backwards-compatible synchronous addScore */
export function addScore(name: string, score: number): boolean {
  saveLocalScore(name, score);
  // Fire and forget save to Firestore
  saveScoreToFirestore(name, score).catch((e) => console.error('Background save failed:', e));
  return true;
}

export function clearScoreDataset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
