import React, { useEffect, useState } from 'react';
import { Trophy, BookOpen, X } from 'lucide-react';
import type { GlobalLeaderboardEntry, WordBankStats } from '../types/game';

interface LeaderboardModalProps {
  initialTab: 'leaderboard' | 'words';
  onClose: () => void;
  wordStats: WordBankStats | null;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ initialTab, onClose, wordStats }) => {
  const [tab, setTab] = useState<'leaderboard' | 'words'>(initialTab);
  const [entries, setEntries] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/leaderboard')
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load leaderboard');
        return res.json();
      })
      .then((data: { leaderboard?: GlobalLeaderboardEntry[] }) => {
        if (!active) return;
        setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not load leaderboard right now.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
              <div className="mb-4">
                <h3 className="font-display text-lg font-bold text-white">All-Time Standings</h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  Cumulative scores recorded across completed rounds on this server.
                </p>
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading standings...</div>
              ) : error ? (
                <div className="py-10 text-center text-sm text-rose-400">{error}</div>
              ) : entries.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-base font-medium text-slate-200">No rounds recorded yet</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Finish your first round in any room and scores will appear here automatically.
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
                        {idx === 0 ? '#1' : idx === 1 ? '#2' : idx === 2 ? '#3' : `#${idx + 1}`}
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
                <h3 className="font-display text-lg font-bold text-white">Curated Word Vault</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Every single word has both a matched Similar Word and a Category, tracked per room with zero repeats.
                </p>
                {wordStats && (
                  <div className="mt-4 grid grid-cols-3 gap-4 border-y border-white/[0.08] py-3.5">
                    <div>
                      <div className="text-xs text-slate-400">Total Words</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-white mt-0.5">
                        {wordStats.total.toLocaleString()}
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
                )}
              </div>

              {wordStats ? (
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
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">Loading word vault stats...</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
