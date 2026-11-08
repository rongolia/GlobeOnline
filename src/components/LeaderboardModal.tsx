import React, { useEffect, useState } from 'react';
import { Trophy, X, Medal, Sparkles } from 'lucide-react';
import { subscribeTopScores, ScoreRecord, MAX_LEADERBOARD_RECORDS } from '../data/leaderboard';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentPlayerName?: string;
  recentScore?: number;
  statusMessage?: string | null;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  recentPlayerName,
  recentScore,
  statusMessage,
}) => {
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const unsubscribe = subscribeTopScores(
      (newScores) => {
        setScores(newScores);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-amber-400/30 bg-slate-900/95 p-6 shadow-2xl shadow-black/80 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close leaderboard"
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.25)]">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
              Hall of Fame
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-300/30">
                Top {MAX_LEADERBOARD_RECORDS}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Only the highest 10 records are saved in the database
            </p>
          </div>
        </div>

        {/* Feedback message if just saved */}
        {statusMessage && (
          <div className="mt-3 mb-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-300" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Scores List */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar min-h-[220px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
              <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Fetching top scores...</span>
            </div>
          ) : scores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center px-4">
              <Medal className="w-10 h-10 text-slate-600 mb-2 stroke-1" />
              <p className="text-sm font-medium text-slate-300">No scores recorded yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Complete a round of the DevFest challenge to claim the #1 spot!
              </p>
            </div>
          ) : (
            scores.map((entry, index) => {
              const rank = index + 1;
              const isRecent =
                recentPlayerName &&
                recentScore !== undefined &&
                entry.name === recentPlayerName &&
                entry.score === recentScore;

              return (
                <div
                  key={entry.id || `${entry.name}-${entry.score}-${index}`}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
                    isRecent
                      ? 'bg-amber-400/20 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
                      : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-800/90'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        rank === 1
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300/50'
                          : rank === 2
                          ? 'bg-slate-300 text-slate-950'
                          : rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {rank}
                    </span>
                    <span
                      className={`font-mono text-base font-bold tracking-widest ${
                        isRecent ? 'text-amber-300' : 'text-slate-100'
                      }`}
                    >
                      {entry.name}
                    </span>
                    {isRecent && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">
                        You
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono text-base font-bold tabular-nums ${
                      rank === 1
                        ? 'text-amber-300'
                        : isRecent
                        ? 'text-amber-200'
                        : 'text-slate-200'
                    }`}
                  >
                    {entry.score.toLocaleString()} pts
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Real-time database sync</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
