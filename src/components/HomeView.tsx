import React, { useState } from 'react';
import { ArrowRight, Users, Sparkles, Vote, Trophy } from 'lucide-react';
import type { ImposterHintMode, WordBankStats, WordPack } from '../types/game';
import { getSavedPlayerName, getSavedRoomCode } from '../hooks/useGameSocket';

interface HomeViewProps {
  initialRoomCode: string;
  wordStats: WordBankStats | null;
  error: string | null;
  isConnecting: boolean;
  onCreateRoom: (playerName: string, wordPack: WordPack, hintMode: ImposterHintMode) => Promise<void>;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  onOpenModal: (tab: 'leaderboard' | 'words') => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  initialRoomCode,
  wordStats,
  error,
  isConnecting,
  onCreateRoom,
  onJoinRoom,
  onOpenModal,
}) => {
  const [mode, setMode] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [playerName, setPlayerName] = useState<string>(() => getSavedPlayerName());
  const [roomCode, setRoomCode] = useState<string>(() => initialRoomCode || getSavedRoomCode());
  const [wordPack, setWordPack] = useState<WordPack>('mixed');
  const [hintMode, setHintMode] = useState<ImposterHintMode>('either');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedName = playerName.trim();
    if (trimmedName.length < 1) {
      setLocalError('Enter your name so other players recognize you.');
      return;
    }

    if (mode === 'join') {
      const cleanedCode = roomCode.trim().toUpperCase();
      if (cleanedCode.length !== 4) {
        setLocalError('Enter the 4-character room code shown on the host phone.');
        return;
      }
      onJoinRoom(cleanedCode, trimmedName);
      return;
    }

    setSubmitting(true);
    try {
      await onCreateRoom(trimmedName, wordPack, hintMode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-14 lg:pt-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Column: Hero Pitch & Live Room Entry */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-amber-400">
              In-Person Party Game · {wordStats ? `${wordStats.total.toLocaleString()} Curated Words` : '1,240+ Curated Words'} · iOS &amp; Android
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1]">
              Spot the imposter before they blend in.
            </h1>
            <p className="text-base text-slate-300 max-w-xl leading-relaxed">
              Everyone joins from their own phone. Civilians see the secret Indian or world-famous word. One random
              imposter gets either a similar word or the category—never both. Talk it out in person, vote from your
              phone, and climb the leaderboard.
            </p>
          </div>

          {/* Primary Play Card */}
          <section className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-5 sm:p-7">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0E121A] mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setLocalError(null);
                }}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'create'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('join');
                  setLocalError(null);
                }}
                className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'join'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Join Room
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="player-name" className="block text-sm font-medium text-slate-200 mb-2">
                  Your Name
                </label>
                <input
                  id="player-name"
                  type="text"
                  maxLength={22}
                  autoComplete="nickname"
                  placeholder="e.g. Aarav, Priya, Rohan"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full min-h-[48px] rounded-xl bg-[#0E121A] border border-white/10 px-4 text-base text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {mode === 'join' ? (
                <div>
                  <label htmlFor="room-code" className="block text-sm font-medium text-slate-200 mb-2">
                    4-Character Room Code
                  </label>
                  <input
                    id="room-code"
                    type="text"
                    maxLength={4}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="K7MP"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    className="w-full min-h-[52px] rounded-xl bg-[#0E121A] border border-white/10 px-4 font-mono tabular-nums text-2xl font-bold tracking-[0.25em] text-amber-400 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 uppercase"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <span className="block text-sm font-medium text-slate-200 mb-2">Word Pack</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'mixed', label: 'Desi + Global' },
                          { id: 'indian', label: 'Indian Only' },
                          { id: 'global', label: 'Global Famous' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setWordPack(opt.id)}
                          className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            wordPack === opt.id
                              ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                              : 'border-white/10 bg-[#0E121A] text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-sm font-medium text-slate-200 mb-2">Imposter Clue (Strictly One)</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'either', label: 'Either (Random)' },
                          { id: 'similar_word', label: 'Similar Word' },
                          { id: 'category', label: 'Category Only' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setHintMode(opt.id)}
                          className={`min-h-[44px] px-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            hintMode === opt.id
                              ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                              : 'border-white/10 bg-[#0E121A] text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {displayError && (
                <div role="alert" className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || isConnecting}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-semibold text-slate-950 hover:bg-amber-400 active:scale-[0.99] disabled:opacity-60 transition-[background-color,transform] duration-150 cursor-pointer"
              >
                <span>
                  {submitting || isConnecting
                    ? 'Connecting...'
                    : mode === 'create'
                      ? 'Create Party Room'
                      : 'Join Party Room'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </section>
        </div>

        {/* Right Column: How to Play & Vault Overview */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10 shrink-0 bg-[#0E121A]">
                <img
                  src="/src/assets/images/khabri_emblem_1795588190937.jpg"
                  alt="Khabri emblem"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-white">Built for Living Rooms</h2>
                <p className="text-sm text-slate-400">3 to 16 players · Zero word repeats</p>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] text-sm">
              <div className="py-3.5 flex items-start gap-3.5">
                <Users className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-white">01. Join on Your Own Phone</div>
                  <p className="text-slate-400 mt-0.5 leading-relaxed">
                    Share the 4-letter code or scan the lobby QR code from iPhone or Android.
                  </p>
                </div>
              </div>
              <div className="py-3.5 flex items-start gap-3.5">
                <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-white">02. Random Starter &amp; Secret Clue</div>
                  <p className="text-slate-400 mt-0.5 leading-relaxed">
                    One player is picked at random to speak first. The imposter gets either a similar word or the category.
                  </p>
                </div>
              </div>
              <div className="py-3.5 flex items-start gap-3.5">
                <Vote className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-white">03. Vote &amp; Instant Verdict</div>
                  <p className="text-slate-400 mt-0.5 leading-relaxed">
                    Everyone votes secretly on their phone. Most-voted player is accused and notified right or wrong.
                  </p>
                </div>
              </div>
              <div className="pt-3.5 flex items-start gap-3.5">
                <Trophy className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-white">04. Play Again in Same Room</div>
                  <p className="text-slate-400 mt-0.5 leading-relaxed">
                    Keep your squad in the exact same room across rounds while the live leaderboard tracks winners.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Word Bank Proof Strip */}
          <div className="rounded-2xl bg-[#151B26] border border-white/[0.08] p-6">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-base font-bold text-white">Massive Non-Repeating Vault</h3>
              <button
                type="button"
                onClick={() => onOpenModal('words')}
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline-offset-4 hover:underline whitespace-nowrap cursor-pointer"
              >
                Browse Categories
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Enough Indian &amp; world-famous words for months of daily game nights.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-white">
                  {wordStats ? wordStats.total.toLocaleString() : '1,240'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Total Words</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-amber-400">
                  {wordStats ? wordStats.indian.toLocaleString() : '780'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Indian Refs</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-200">
                  {wordStats ? wordStats.global.toLocaleString() : '460'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">World Famous</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};
