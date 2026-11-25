import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, QrCode, Play, UserX, Trophy, Users, LogOut } from 'lucide-react';
import type { PublicRoomState, RoomSettings } from '../types/game';

interface LobbyViewProps {
  room: PublicRoomState;
  playerId: string;
  error: string | null;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onStartRound: () => void;
  onKickPlayer: (targetId: string) => void;
  onLeaveRoom: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  playerId,
  error,
  onUpdateSettings,
  onStartRound,
  onKickPlayer,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const [rightTab, setRightTab] = useState<'players' | 'leaderboard'>('players');

  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const connectedPlayers = room.players.filter((p) => p.connected);
  const canStart = connectedPlayers.length >= 3;

  const inviteUrl = `${window.location.origin}/?room=${room.code}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const input = document.createElement('input');
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join Khabri Room ${room.code}`,
          text: `Join our Imposter party game! Room code: ${room.code}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    handleCopyLink();
  };

  const packLabels: Record<RoomSettings['wordPack'], string> = {
    mixed: 'Desi + Global',
    indian: 'Indian Only',
    global: 'Global Famous',
  };

  const hintLabels: Record<RoomSettings['hintMode'], string> = {
    either: 'Either (Random)',
    similar_word: 'Similar Word',
    category: 'Category Only',
  };

  const rankedPlayers = [...room.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-28 sm:pb-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Room Code, QR Invite & Game Settings */}
        <div className="lg:col-span-5 space-y-6">
          {/* Room Invite Card */}
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-400">
                  Party Room · Round {room.roundNumber + 1} Next
                </p>
                <div className="mt-1 font-mono tabular-nums text-4xl sm:text-5xl font-bold tracking-[0.22em] text-amber-400">
                  {room.code}
                </div>
              </div>
              <button
                type="button"
                onClick={onLeaveRoom}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave</span>
              </button>
            </div>

            <p className="mt-2.5 text-sm text-slate-400">
              Ask friends sitting with you to scan the QR code or enter <span className="font-mono text-slate-200">{room.code}</span> on their phone.
            </p>

            {/* Action Buttons */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0E121A] border border-white/10 px-3 text-xs font-semibold text-slate-100 hover:border-white/25 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0E121A] border border-white/10 px-3 text-xs font-semibold text-slate-100 hover:border-white/25 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQR((prev) => !prev)}
                className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  showQR
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#0E121A] border-white/10 text-slate-100 hover:border-white/25'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQR ? 'Hide QR' : 'Show QR'}</span>
              </button>
            </div>

            {showQR && (
              <div className="mt-5 flex flex-col items-center pt-5 border-t border-white/[0.06]">
                <div className="rounded-2xl bg-white p-3.5 shadow-lg">
                  <QRCodeSVG value={inviteUrl} size={156} level="M" fgColor="#0E121A" bgColor="#FFFFFF" />
                </div>
                <p className="mt-2.5 text-xs text-slate-400">Point iPhone or Android camera to join instantly</p>
              </div>
            )}
          </section>

          {/* Settings Card */}
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Round Rules</h2>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {room.availableWordCount.toLocaleString()} unseen words left
              </span>
            </div>

            {isHost ? (
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-2">Word Pack</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['mixed', 'indian', 'global'] as const).map((pack) => (
                      <button
                        key={pack}
                        type="button"
                        onClick={() => onUpdateSettings({ wordPack: pack })}
                        className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          room.settings.wordPack === pack
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                            : 'border-white/10 bg-[#0E121A] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {packLabels[pack]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-2">
                    Imposter Clue (Strictly One of Two)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['either', 'similar_word', 'category'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onUpdateSettings({ hintMode: mode })}
                        className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          room.settings.hintMode === mode
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                            : 'border-white/10 bg-[#0E121A] text-slate-300 hover:border-white/20'
                        }`}
                      >
                        {hintLabels[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-400 mb-2">Number of Imposters</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2].map((count) => {
                      const disabled = count === 2 && connectedPlayers.length < 6;
                      return (
                        <button
                          key={count}
                          type="button"
                          disabled={disabled}
                          onClick={() => onUpdateSettings({ imposterCount: count })}
                          className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            room.settings.imposterCount === count && !disabled
                              ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                              : 'border-white/10 bg-[#0E121A] text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {count === 1 ? '1 Imposter' : '2 Imposters (6+ Players)'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] text-sm">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-slate-400">Word Pack</span>
                  <span className="font-semibold text-white">{packLabels[room.settings.wordPack]}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-slate-400">Imposter Clue</span>
                  <span className="font-semibold text-white">{hintLabels[room.settings.hintMode]}</span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-slate-400">Imposters</span>
                  <span className="font-semibold text-white">
                    {room.settings.imposterCount === 2 && connectedPlayers.length >= 6 ? '2 Imposters' : '1 Imposter'}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Live Players & Room Leaderboard */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="font-display text-xl font-bold text-white">
                  Players in Room ({connectedPlayers.length})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Minimum 3 players required · Same room persists across rounds
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0E121A]">
                <button
                  type="button"
                  onClick={() => setRightTab('players')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    rightTab === 'players' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Roster</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('leaderboard')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    rightTab === 'leaderboard' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Leaderboard</span>
                </button>
              </div>
            </div>

            {rightTab === 'players' ? (
              <div className="divide-y divide-white/[0.06] mt-2">
                {room.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-slate-950 shrink-0"
                        style={{ backgroundColor: p.avatarColor }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate">{p.name}</span>
                          {p.id === playerId && (
                            <span className="text-xs font-medium text-amber-400 whitespace-nowrap">(You)</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {p.isHost ? 'Room Host' : 'Player'}
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span className={p.connected ? 'text-emerald-400' : 'text-slate-500'}>
                            {p.connected ? 'Connected' : 'Reconnecting...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {room.roundNumber > 0 && (
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-300">
                          {p.score} pts
                        </span>
                      )}
                      {isHost && p.id !== playerId && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] mt-2">
                {rankedPlayers.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3.5">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="w-7 font-mono tabular-nums text-sm font-bold text-slate-400 shrink-0">
                        #{idx + 1}
                      </span>
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                        style={{ backgroundColor: p.avatarColor }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {p.name}
                          {p.id === playerId ? ' (You)' : ''}
                        </div>
                        <div className="text-xs text-slate-400">
                          {p.roundsWon} wins · {p.roundsPlayed} rounds
                        </div>
                      </div>
                    </div>
                    <div className="font-mono tabular-nums text-base font-bold text-amber-400 shrink-0">
                      {p.score} pts
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            {/* Desktop Action Footer */}
            <div className="hidden sm:block mt-6 pt-5 border-t border-white/[0.06]">
              {isHost ? (
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={onStartRound}
                  className="w-full min-h-[52px] inline-flex items-center justify-center gap-2.5 rounded-xl bg-amber-500 px-6 text-base font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99] transition-[background-color,transform] duration-150 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {canStart
                      ? room.roundNumber === 0
                        ? 'Start Round 1'
                        : `Start Round ${room.roundNumber + 1}`
                      : `Need ${3 - connectedPlayers.length} More Player${3 - connectedPlayers.length === 1 ? '' : 's'} to Start`}
                  </span>
                </button>
              ) : (
                <div className="rounded-xl bg-[#0E121A] border border-white/[0.06] px-4 py-3.5 text-center text-sm text-slate-300">
                  Waiting for the host to start Round {room.roundNumber + 1}. Keep your screen ready.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Mobile Fixed Thumb-Zone CTA */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#0E121A] via-[#0E121A]/95 to-transparent">
        {isHost ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={onStartRound}
            className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-semibold text-slate-950 shadow-xl disabled:opacity-45 active:scale-[0.98] transition-[background-color,transform] duration-150 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {canStart
                ? `Start Round ${room.roundNumber + 1}`
                : `Waiting for ${3 - connectedPlayers.length} more player${3 - connectedPlayers.length === 1 ? '' : 's'}`}
            </span>
          </button>
        ) : (
          <div className="w-full min-h-[48px] flex items-center justify-center rounded-xl bg-[#151B26] border border-white/10 px-4 text-sm font-medium text-slate-300">
            Waiting for host to start Round {room.roundNumber + 1}
          </div>
        )}
      </div>
    </main>
  );
};
