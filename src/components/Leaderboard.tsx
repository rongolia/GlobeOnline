import React, { useEffect, useState } from 'react';
import { subscribeTopScores, ScoreRecord, MAX_LEADERBOARD_RECORDS } from '../data/leaderboard';
import { SURFACE, SURFACE_DARK, PANEL_LABEL, PILL_LEADERBOARD } from './ui';

/** The player's own score from the game just played, as saved. */
export interface YourScore {
  /** Document id, when the save reached the database. */
  id?: string;
  name: string;
  score: number;
  /** Overall place on the board, when it could be worked out. */
  position?: number;
}

/** How the last save went: shown above the rows straight after one. */
export interface LeaderboardStatus {
  ok: boolean;
  text: string;
}

/**
 * Before a game, the way to bring the board up (and put it away again): a solid pill
 * like every other live action, in its own colour so it is never mistaken for Start.
 */
export const LeaderboardButton: React.FC<{ onClick: () => void; open: boolean }> = ({ onClick, open }) => (
  <button type="button" onClick={onClick} aria-pressed={open} className={PILL_LEADERBOARD}>
    Top {MAX_LEADERBOARD_RECORDS}
  </button>
);

// One row, drawn like the score box it sits under: the same dark surface, the same
// amber figures. Shorter than the 3.5rem HUD boxes so ten of them fit under the score.
const ROW = 'w-80 h-10 px-4 flex items-center gap-4 text-xl font-semibold tabular-nums';
// The rank column, wide enough for a three-digit place on the extra row below the ten.
const RANK = 'w-10 shrink-0';
// The player's own row stands out the same way wherever it appears.
const YOU_ROW = `${SURFACE} bg-amber-400/15 border-amber-300/80`;

interface LeaderboardProps {
  /** Whether the live listener should run. The last scores are kept while it is off. */
  active: boolean;
  /**
   * The score just saved. Marked out where it appears in the ten, and given a row of its
   * own under them when it is not one of them.
   */
  you?: YourScore | null;
  status?: LeaderboardStatus | null;
}

/**
 * The top scores, live from the database, as part of the HUD rather than a window over
 * it: a caption and ten rows, each its own surface, on the same footing as the score and
 * the chances. Where it sits and when it shows is the caller's business.
 *
 * It always lists all ten places. A place nobody has reached yet is an empty slot rather
 * than missing, so the board keeps its shape however many scores there are.
 *
 * A score that did not make the ten still gets shown: one more row, always at the
 * bottom and set a little apart, with the player's overall place. Whether it is in the
 * ten is read off the live list rather than the save, so a score that gets pushed out
 * while the board is up moves down to that row instead of disappearing.
 */
export const Leaderboard: React.FC<LeaderboardProps> = ({ active, you, status }) => {
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeTopScores(
      (newScores) => {
        setScores(newScores);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsubscribe();
  }, [active]);

  const youInTop = !!you?.id && scores.some((s) => s.id === you.id);
  const showYouBelow = !!you && !loading && !youInTop;

  return (
    <section aria-labelledby="leaderboard-title" className="flex flex-col items-end">
      <h2 id="leaderboard-title" className={PANEL_LABEL}>
        Top {MAX_LEADERBOARD_RECORDS}
      </h2>

      {status && (
        <div
          role="status"
          className={`${SURFACE} w-80 mb-1.5 px-4 py-2 text-base font-semibold ${
            status.ok
              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
              : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
          }`}
        >
          {status.text}
        </div>
      )}

      <ol className="flex flex-col gap-1.5" aria-busy={loading}>
        {Array.from({ length: MAX_LEADERBOARD_RECORDS }, (_, index) => {
          const rank = index + 1;
          const entry = loading ? undefined : scores[index];
          if (!entry) {
            return (
              <li
                key={`empty-${rank}`}
                className={`${SURFACE} ${ROW} border-dashed border-slate-700/70 bg-slate-900/40`}
              >
                <span className={`${RANK} text-slate-500`}>{rank}</span>
                <span className="tracking-widest text-slate-600" aria-label={loading ? 'Loading' : 'Empty'}>
                  {loading ? '···' : '---'}
                </span>
                <span className="ml-auto text-slate-600" aria-hidden="true">
                  –
                </span>
              </li>
            );
          }
          const isYou = !!you?.id && entry.id === you.id;
          return (
            <li
              key={entry.id ?? `${entry.name}-${entry.score}-${index}`}
              className={`${ROW} ${isYou ? YOU_ROW : SURFACE_DARK}`}
            >
              <span className={`${RANK} ${rank <= 3 ? 'text-amber-300' : 'text-slate-400'}`}>{rank}</span>
              <span className={`tracking-widest ${isYou ? 'text-amber-300' : 'text-slate-100'}`}>{entry.name}</span>
              {isYou && <span className="text-sm uppercase tracking-widest text-amber-300/80">You</span>}
              <span className="ml-auto text-amber-300">{entry.score}</span>
            </li>
          );
        })}
      </ol>

      {/* Not in the ten: the player's own line, below the list and a little apart from
          it, with where they actually stand. "–" when the place could not be counted. */}
      {showYouBelow && you && (
        <div className={`${ROW} ${YOU_ROW} mt-3`} aria-label={`Your score: ${you.score}`}>
          <span className={`${RANK} text-amber-300/80`}>{you.position ?? '–'}</span>
          <span className="tracking-widest text-amber-300">{you.name}</span>
          <span className="text-sm uppercase tracking-widest text-amber-300/80">You</span>
          <span className="ml-auto text-amber-300">{you.score}</span>
        </div>
      )}
    </section>
  );
};
