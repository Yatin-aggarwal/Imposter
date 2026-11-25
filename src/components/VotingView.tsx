import React, { useState } from 'react';
import { Check, Vote, ShieldAlert } from 'lucide-react';
import type { PublicRoomState, SecretPlayerAssignment } from '../types/game';
import { playVoteCastSound } from '../utils/sound';

interface VotingViewProps {
  room: PublicRoomState;
  secret: SecretPlayerAssignment | null;
  playerId: string;
  onCastVote: (targetId: string) => void;
  onForceTally: () => void;
}

export const VotingView: React.FC<VotingViewProps> = ({ room, secret, playerId, onCastVote, onForceTally }) => {
  const [selectedId, setSelectedId] = useState<string | null>(room.myVoteTargetId);

  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const canVote = Boolean(secret);

  const connectedPlayers = room.players.filter((p) => p.connected && p.inCurrentRound);
  const votableTargets = room.players.filter((p) => p.id !== playerId && p.inCurrentRound);
  const activeSelected = selectedId ?? room.myVoteTargetId;
  const selectedPlayer = room.players.find((p) => p.id === activeSelected);
  const hasLockedCurrent = Boolean(room.myVoteTargetId && room.myVoteTargetId === activeSelected);

  const progressPct =
    connectedPlayers.length > 0 ? Math.min(100, Math.round((room.votedCount / connectedPlayers.length) * 100)) : 0;

  const handleConfirmVote = () => {
    if (!activeSelected) return;
    playVoteCastSound();
    onCastVote(activeSelected);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-28 sm:pb-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Suspect Ballot */}
        <section className="lg:col-span-7 rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
          <div className="pb-4 border-b border-white/[0.06]">
            <p className="text-xs font-medium text-amber-400">
              Round {room.roundNumber} · Secret Ballot
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1">
              Who is the Imposter?
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Tap one player below and lock in your vote. The most-voted player will be accused once everyone votes.
            </p>
          </div>

          {canVote ? (
            <div className="mt-4 space-y-2.5">
              {votableTargets.map((target) => {
                const isSelected = activeSelected === target.id;
                const isLockedChoice = room.myVoteTargetId === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setSelectedId(target.id)}
                    className={`w-full min-h-[64px] flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/12'
                        : 'border-white/[0.08] bg-[#0E121A] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-slate-950 shrink-0"
                        style={{ backgroundColor: target.avatarColor }}
                      >
                        {target.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{target.name}</div>
                        <div className="text-xs text-slate-400">
                          {isLockedChoice
                            ? 'Your locked vote'
                            : target.id === room.startingPlayerId
                              ? 'Started discussion'
                              : 'Tap to select'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}

              {/* Desktop Confirm Button */}
              <div className="hidden sm:block pt-4">
                <button
                  type="button"
                  disabled={!activeSelected || hasLockedCurrent}
                  onClick={handleConfirmVote}
                  className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-[background-color,transform] duration-150 cursor-pointer"
                >
                  <Vote className="w-4 h-4" />
                  <span>
                    {hasLockedCurrent
                      ? `Vote Locked for ${selectedPlayer?.name ?? 'Player'}`
                      : selectedPlayer
                        ? `Confirm Vote for ${selectedPlayer.name}`
                        : 'Select a Player to Vote'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-slate-300">
              You joined mid-round, so voting is paused for you until Round {room.roundNumber + 1}.
            </div>
          )}
        </section>

        {/* Right Column: Live Anonymous Tally Progress */}
        <aside className="lg:col-span-5 space-y-5">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold text-white">Ballot Progress</h2>
              <span className="font-mono tabular-nums text-sm font-bold text-amber-400">
                {room.votedCount} / {connectedPlayers.length}
              </span>
            </div>

            <div className="mt-3 h-2 w-full rounded-full bg-[#0E121A] overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="divide-y divide-white/[0.06] mt-4">
              {room.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-slate-200 truncate pr-2">
                    {p.name}
                    {p.id === playerId ? ' (You)' : ''}
                  </span>
                  <span className={`text-xs font-semibold shrink-0 ${p.hasVoted ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {p.hasVoted ? 'Voted' : 'Deciding...'}
                  </span>
                </div>
              ))}
            </div>

            {isHost && (
              <div className="mt-5 pt-4 border-t border-white/[0.06]">
                <button
                  type="button"
                  disabled={room.votedCount === 0}
                  onClick={onForceTally}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0E121A] px-4 text-xs font-semibold text-slate-200 hover:bg-white/[0.06] disabled:opacity-40 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Reveal Results Now (Host Override)</span>
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Mobile Sticky Vote Confirm CTA */}
      {canVote && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#0E121A] via-[#0E121A]/95 to-transparent">
          <button
            type="button"
            disabled={!activeSelected || hasLockedCurrent}
            onClick={handleConfirmVote}
            className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-semibold text-slate-950 shadow-xl disabled:opacity-50 active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer"
          >
            <Vote className="w-4 h-4" />
            <span className="truncate">
              {hasLockedCurrent
                ? `Locked: ${selectedPlayer?.name ?? 'Voted'}`
                : selectedPlayer
                  ? `Confirm Vote: ${selectedPlayer.name}`
                  : 'Select a Suspect Above'}
            </span>
          </button>
        </div>
      )}
    </main>
  );
};
