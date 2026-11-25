import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Mic, Check, Lock } from 'lucide-react';
import type { PublicRoomState, SecretPlayerAssignment } from '../types/game';
import { playCardRevealSound, playVoteCastSound } from '../utils/sound';

interface PlayViewProps {
  room: PublicRoomState;
  secret: SecretPlayerAssignment | null;
  playerId: string;
  onCastVote: (targetId: string) => void;
}

export const PlayView: React.FC<PlayViewProps> = ({ room, secret, playerId, onCastVote }) => {
  const [revealed, setRevealed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset card face-down whenever a fresh round starts
  useEffect(() => {
    setRevealed(false);
  }, [room.roundNumber]);

  const isStartingPlayer = room.startingPlayerId === playerId;
  const activePlayers = room.players.filter((p) => p.inCurrentRound);
  const votableTargets = activePlayers.filter((p) => p.id !== playerId);
  const totalVoters = room.activeVoterCount || activePlayers.filter((p) => p.connected).length;
  const remainingVotes = Math.max(0, totalVoters - room.votedCount);
  const progressPct = totalVoters > 0 ? Math.min(100, Math.round((room.votedCount / totalVoters) * 100)) : 0;

  const myVotedPlayer = room.players.find((p) => p.id === room.myVoteTargetId);

  const handleToggleReveal = () => {
    const next = !revealed;
    setRevealed(next);
    if (next && secret) {
      playCardRevealSound(secret.role === 'imposter');
    }
  };

  const handleTapVote = (targetId: string) => {
    if (!secret) return;
    if (room.myVoteTargetId !== targetId) {
      playVoteCastSound();
      onCastVote(targetId);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-14">
      {/* Top Spotlight: Random Discussion Starter & Live Anonymous Vote Count */}
      <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-amber-400">
                Round {room.roundNumber} · Speaks First (Randomly Picked)
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
                {isStartingPlayer ? 'You start the discussion!' : `${room.startingPlayerName} speaks first`}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Peek at your card, give clues out loud around the circle, then tap who you suspect.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="text-xs text-slate-400">Votes Cast</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-amber-400 mt-0.5">
              {room.votedCount} / {totalVoters}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Tactile Secret Card */}
        <div className="lg:col-span-5 flex flex-col items-center">
          {secret ? (
            <div className="w-full max-w-sm">
              <button
                type="button"
                onClick={handleToggleReveal}
                aria-pressed={revealed}
                className="w-full text-left card-perspective focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-3xl cursor-pointer block"
              >
                <div className={`card-inner relative w-full aspect-[3/4] ${revealed ? 'is-flipped' : ''}`}>
                  {/* Card Front (Hidden) */}
                  <div className="card-face absolute inset-0 rounded-3xl overflow-hidden border border-white/15 bg-[#121824] shadow-2xl">
                    {!imgFailed ? (
                      <img
                        src="/src/assets/images/card_back_pattern_1795588192900.jpg"
                        alt="Face-down secret role card"
                        referrerPolicy="no-referrer"
                        onError={() => setImgFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-b from-[#171F2E] to-[#0E121A] flex items-center justify-center p-8">
                        <div className="w-full h-full rounded-2xl border border-amber-500/30 flex items-center justify-center">
                          <Eye className="w-12 h-12 text-amber-400/80" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20 flex flex-col justify-between p-6">
                      <div className="text-xs font-mono text-amber-300/90">
                        ROOM {room.code} · ROUND {room.roundNumber}
                      </div>
                      <div className="text-center space-y-2 pb-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
                          <Eye className="w-5 h-5" />
                        </div>
                        <div className="font-display text-2xl font-bold text-white">Tap to Peek</div>
                        <p className="text-xs text-slate-300">
                          Shield your phone from players sitting beside you
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Card Back (Revealed Secret) */}
                  <div
                    className={`card-face card-face-back absolute inset-0 rounded-3xl border p-6 sm:p-7 flex flex-col justify-between shadow-2xl ${
                      secret.role === 'imposter'
                        ? 'bg-[#1D1218] border-rose-500/40'
                        : 'bg-[#111C1B] border-emerald-500/35'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className={secret.role === 'imposter' ? 'text-rose-400' : 'text-emerald-400'}>
                        {secret.role === 'imposter' ? 'Your Role · Imposter' : 'Your Role · Civilian'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Tap to hide</span>
                      </span>
                    </div>

                    {secret.role === 'civilian' ? (
                      <div className="text-center my-auto py-6">
                        <p className="text-xs font-medium text-slate-400">Secret Word</p>
                        <div className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                          {secret.word}
                        </div>
                        <p className="mt-5 text-sm text-slate-300 leading-relaxed">
                          Describe it subtly so civilians recognize you, without giving the word away to the imposter.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center my-auto py-6">
                        <p className="text-xs font-medium text-rose-300">
                          {secret.hintType === 'similar_word'
                            ? 'Your Single Clue · Similar Word'
                            : 'Your Single Clue · Category'}
                        </p>
                        <div className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">
                          {secret.hintValue}
                        </div>
                        <p className="mt-5 text-sm text-slate-300 leading-relaxed">
                          {secret.hintType === 'similar_word'
                            ? 'Everyone else has a closely related word—not this exact one. Listen carefully and blend in!'
                            : 'Everyone else knows a specific famous word in this category. Listen closely and stay undercover!'}
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-white/10 text-center text-xs text-slate-400">
                      Tap card again to flip face-down for privacy
                    </div>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-3xl bg-[#151B26] border border-white/10 p-8 text-center">
              <h2 className="font-display text-xl font-bold text-white">Round Already Underway</h2>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                You joined while Round {room.roundNumber} was already active. Watch the discussion—you will
                automatically be dealt in for Round {room.roundNumber + 1}.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Ultra-Easy 1-Tap Voting Grid & Auto-Reveal Progress */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Vote Anytime — Tap a Player
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {myVotedPlayer ? (
                    <>
                      You voted for <strong className="text-amber-300">{myVotedPlayer.name}</strong>. You can switch
                      your vote anytime until the last player votes.
                    </>
                  ) : (
                    'Cast your vote anytime—no need to wait for anyone else to be ready.'
                  )}
                </p>
              </div>
            </div>

            {secret ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {votableTargets.map((target) => {
                  const isMyVote = room.myVoteTargetId === target.id;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => handleTapVote(target.id)}
                      aria-pressed={isMyVote}
                      className={`min-h-[96px] flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 cursor-pointer ${
                        isMyVote
                          ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/5'
                          : 'border-white/[0.09] bg-[#0E121A] hover:border-white/25 hover:bg-[#121722]'
                      }`}
                    >
                      <div className="relative">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-slate-950"
                          style={{ backgroundColor: target.avatarColor }}
                        >
                          {target.name.slice(0, 2).toUpperCase()}
                        </div>
                        {isMyVote && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center border-2 border-[#151B26]">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div className="w-full">
                        <div className="font-semibold text-white text-sm sm:text-base truncate">{target.name}</div>
                        <div className={`text-xs mt-0.5 ${isMyVote ? 'font-semibold text-amber-300' : 'text-slate-500'}`}>
                          {isMyVote ? 'Your Vote' : 'Tap to Vote'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                Voting will open for you automatically in Round {room.roundNumber + 1}.
              </div>
            )}

            {/* Strictly Locked Auto-Reveal Progress Bar (Zero Early Reveal Options) */}
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {remainingVotes === 1
                      ? 'Waiting for 1 more player to vote'
                      : `Waiting for ${remainingVotes} more players to vote`}
                  </span>
                </span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {room.votedCount} / {totalVoters}
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-[#0E121A] overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <p className="mt-2.5 text-xs text-slate-400">
                The imposter stays completely secret until every player votes—then results reveal automatically for everyone.
              </p>

              {/* Anonymous Voted vs Waiting Roster */}
              <div className="mt-4 divide-y divide-white/[0.06]">
                {activePlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-200 truncate pr-2">
                      {p.name}
                      {p.id === playerId ? ' (You)' : ''}
                    </span>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        p.hasVoted ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {p.hasVoted ? 'Voted' : 'Waiting'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
