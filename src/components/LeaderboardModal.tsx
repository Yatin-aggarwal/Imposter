import React, { useState } from 'react';
import { Trophy, BookOpen, X, RotateCcw } from 'lucide-react';
import type { GlobalLeaderboardEntry, WordBankStats } from '../types/game';
import { clearGlobalLeaderboard, clearUsedWordIds, loadUsedWordIds } from '../services/localStore';

interface LeaderboardModalProps {
  initialTab: 'leaderboard' | 'words';
  entries: GlobalLeaderboardEntry[];
  onRefreshLeaderboard: () => void;
  onClose: () => void;
  wordStats: WordBankStats;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  initialTab,
  entries,
  onRefreshLeaderboard,
  onClose,
  wordStats,
}) => {
  const [tab, setTab] = useState<'leaderboard' | 'words'>(initialTab);
  const [usedCount, setUsedCount] = useState<number>(() => loadUsedWordIds().size);
  const [confirmResetScores, setConfirmResetScores] = useState(false);
  const [confirmResetWords, setConfirmResetWords] = useState(false);

  const handleResetScores = () => {
    clearGlobalLeaderboard();
    onRefreshLeaderboard();
    setConfirmResetScores(false);
  };

  const handleResetWords = () => {
    clearUsedWordIds();
    setUsedCount(0);
    setConfirmResetWords(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-[#151B26] border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0E121A]">
            <button
              type="button"
              onClick={() => setTab('leaderboard')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'leaderboard' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>All-Time Leaderboard</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('words')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === 'words' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Word Vault</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === 'leaderboard' ? (
            <div>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">All-Time Standings</h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Saved in your browser local storage and synced with players after every round.
                  </p>
                </div>

                {entries.length > 0 && (
                  <div className="shrink-0">
                    {confirmResetScores ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetScores}
                          className="min-h-[36px] px-3 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-400 whitespace-nowrap cursor-pointer"
                        >
                          Confirm Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetScores(false)}
                          className="min-h-[36px] px-2.5 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmResetScores(true)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-white/10 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] whitespace-nowrap cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {entries.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-base font-medium text-slate-200">No rounds recorded yet</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Finish your first round in any room and scores will be saved right here in local storage.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  <div className="grid grid-cols-12 pb-2.5 text-xs font-medium text-slate-400">
                    <div className="col-span-2">Rank</div>
                    <div className="col-span-5">Player</div>
                    <div className="col-span-2 text-right">Wins</div>
                    <div className="col-span-3 text-right">Points</div>
                  </div>
                  {entries.map((entry, idx) => (
                    <div key={`${entry.name}-${idx}`} className="grid grid-cols-12 items-center py-3 text-sm">
                      <div className="col-span-2 font-mono tabular-nums font-semibold text-slate-300">
                        #{idx + 1}
                      </div>
                      <div className="col-span-5 pr-2">
                        <div className="font-semibold text-white truncate">{entry.name}</div>
                        <div className="text-xs text-slate-400">
                          {entry.roundsPlayed} rounds · {entry.imposterWins} imposter wins
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-mono tabular-nums text-slate-300">
                        {entry.roundsWon}
                      </div>
                      <div className="col-span-3 text-right font-mono tabular-nums font-bold text-amber-400">
                        {entry.score.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Curated Word Vault</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Played words are remembered in local storage so your group never repeats words across months.
                    </p>
                  </div>
                  {usedCount > 0 && (
                    <div className="shrink-0">
                      {confirmResetWords ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleResetWords}
                            className="min-h-[36px] px-3 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                          >
                            Reset History
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResetWords(false)}
                            className="min-h-[36px] px-2.5 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmResetWords(true)}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-white/10 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] whitespace-nowrap cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset ({usedCount})</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 border-y border-white/[0.08] py-3.5">
                  <div>
                    <div className="text-xs text-slate-400">Unseen Remaining</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-white mt-0.5">
                      {Math.max(0, wordStats.total - usedCount).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Indian &amp; Desi</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-amber-400 mt-0.5">
                      {wordStats.indian.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Global Famous</div>
                    <div className="font-mono tabular-nums text-2xl font-bold text-slate-200 mt-0.5">
                      {wordStats.global.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {wordStats.categories.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <span className="font-medium text-slate-100">{cat.name}</span>
                      <span className="text-slate-500 mx-2" aria-hidden="true">·</span>
                      <span className="text-xs text-slate-400">
                        {cat.region === 'indian' ? 'Indian' : 'Global'}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-300">
                      {cat.count} words
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
