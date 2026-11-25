import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Play, Settings2, Trophy } from 'lucide-react';
import type { PublicRoomState } from '../types/game';
import { playVerdictSound } from '../utils/sound';

interface ResultsViewProps {
  room: PublicRoomState;
  playerId: string;
  onNextRound: () => void;
  onBackToLobby: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ room, playerId, onNextRound, onBackToLobby }) => {
  const result = room.lastResult;

  useEffect(() => {
    if (result) {
      playVerdictSound(result.caughtImposter);
    }
  }, [result]);

  if (!result) return null;

  const myDelta = result.scoreDeltas.find((d) => d.playerId === playerId);
  const rankedPlayers = [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const deltaMap = new Map(result.scoreDeltas.map((d) => [d.playerId, d]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-28 sm:pb-14">
      {/* Verdict Hero Banner */}
      <section
        className={`rounded-2xl border p-6 sm:p-8 mb-6 ${
          result.caughtImposter
            ? 'bg-[#101F1A] border-emerald-500/35'
            : 'bg-[#211319] border-rose-500/35'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              {result.caughtImposter ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400">Verdict · Correct! Imposter Caught</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <span className="text-rose-400">
                    {result.outcome === 'tie_escaped'
                      ? 'Verdict · Wrong! Split Vote — Imposter Escaped'
                      : 'Verdict · Wrong! Innocent Player Voted Out'}
                  </span>
                </>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight">
              {result.caughtImposter ? (
                <>
                  {result.mostVotedPlayerName} was the Imposter!
                </>
              ) : result.outcome === 'tie_escaped' ? (
                <>
                  Votes were tied. {result.imposterNames.join(' & ')} escaped!
                </>
              ) : (
                <>
                  {result.mostVotedPlayerName} was innocent — {result.imposterNames.join(' & ')} was the Imposter!
                </>
              )}
            </h1>

            {myDelta && (
              <p className="text-sm text-slate-200">
                Your Round {result.roundNumber} Score:{' '}
                <strong className="font-mono tabular-nums text-amber-400">+{myDelta.pointsEarned} pts</strong>
                <span className="mx-2 text-slate-500" aria-hidden="true">·</span>
                <span className="text-slate-300">{myDelta.reason}</span>
              </p>
            )}
          </div>

          {/* Revealed Word Summary */}
          <div className="sm:text-right border-t sm:border-t-0 pt-4 sm:pt-0 border-white/10 shrink-0">
            <div className="text-xs text-slate-400">Civilian Secret Word</div>
            <div className="font-display text-2xl sm:text-3xl font-bold text-amber-400 mt-0.5">
              {result.secretWord}
            </div>
            <div className="text-xs text-slate-300 mt-1">
              {result.category} · {result.region === 'indian' ? 'Indian Reference' : 'Global Famous'}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Clue Reveal & Full Vote Breakdown */}
        <div className="lg:col-span-6 space-y-6">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white">Round {result.roundNumber} Intel</h2>
            <div className="divide-y divide-white/[0.06] mt-3 text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-slate-400">Imposter</span>
                <span className="font-semibold text-rose-400 text-right">{result.imposterNames.join(', ')}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-slate-400">Imposter&apos;s Clue (Category)</span>
                <span className="font-semibold text-white text-right">{result.category}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-slate-400">Most Voted</span>
                <span className="font-semibold text-white text-right">
                  {result.mostVotedPlayerName
                    ? `${result.mostVotedPlayerName} (${result.mostVotesCount} votes)`
                    : 'Tie / No majority'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="text-slate-400">Started Discussion</span>
                <span className="font-medium text-slate-200 text-right">{result.startingPlayerName}</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white">Who Voted for Whom</h2>
            {result.voteBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 mt-3">No votes were cast this round.</p>
            ) : (
              <div className="divide-y divide-white/[0.06] mt-3 text-sm">
                {result.voteBreakdown.map((v) => (
                  <div key={v.voterId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <span className="font-semibold text-white">{v.voterName}</span>
                      <span className="text-slate-500 mx-2">voted</span>
                      <span className="font-semibold text-slate-200">{v.targetName}</span>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        v.votedForImposter ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {v.votedForImposter ? 'Correct' : 'Missed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live Room Leaderboard & Next Round */}
        <div className="lg:col-span-6 space-y-6">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="font-display text-xl font-bold text-white inline-flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>Room Leaderboard</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Room {room.code} · {room.availableWordCount.toLocaleString()} fresh words remaining
                </p>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] mt-2">
              {rankedPlayers.map((p, idx) => {
                const delta = deltaMap.get(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 font-mono tabular-nums text-sm font-bold shrink-0 ${
                          idx === 0 ? 'text-amber-400' : 'text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                        style={{ backgroundColor: p.avatarColor }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-sm truncate">
                          {p.name}
                          {p.id === playerId ? ' (You)' : ''}
                        </div>
                        <div className="text-xs text-slate-400">
                          {p.roundsWon} wins · {p.roundsPlayed} rounds
                          {delta?.wasImposter ? ' · Was Imposter' : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums text-base font-bold text-white">{p.score} pts</div>
                      {delta && delta.pointsEarned > 0 && (
                        <div className="font-mono tabular-nums text-xs font-semibold text-emerald-400">
                          +{delta.pointsEarned}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Next Round Controls (Equal for every player) */}
            <div className="hidden sm:flex items-center gap-3 mt-6 pt-5 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onNextRound}
                className="flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-base font-semibold text-slate-950 hover:bg-amber-400 active:scale-[0.99] transition-[background-color,transform] duration-150 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Play Round {room.roundNumber + 1}</span>
              </button>
              <button
                type="button"
                onClick={onBackToLobby}
                className="min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0E121A] px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.06] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Settings2 className="w-4 h-4" />
                <span>Lobby</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Mobile Sticky Replay Bar (Equal for every player) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#0E121A] via-[#0E121A]/95 to-transparent flex gap-2.5">
        <button
          type="button"
          onClick={onNextRound}
          className="flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 shadow-xl active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Play Round {room.roundNumber + 1}</span>
        </button>
        <button
          type="button"
          onClick={onBackToLobby}
          className="min-h-[50px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#151B26] px-4 text-sm font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Settings2 className="w-4 h-4" />
          <span>Lobby</span>
        </button>
      </div>
    </main>
  );
};
