import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { WORD_BANK_STATS } from './data/wordBank';
import { useGameSocket } from './hooks/useGameSocket';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { PlayView } from './components/PlayView';
import { VotingView } from './components/VotingView';
import { ResultsView } from './components/ResultsView';
import { LeaderboardModal } from './components/LeaderboardModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  const {
    playerId,
    roomState,
    secret,
    connectionStatus,
    error,
    leaderboard,
    savedHostSnapshot,
    createHostRoom,
    resumeHostRoom,
    connectAndJoin,
    leaveRoom,
    refreshLeaderboard,
    updateSettings,
    startRound,
    setReadyToVote,
    openVoting,
    castVote,
    forceTally,
    backToLobby,
    kickPlayer,
  } = useGameSocket();

  const [modalTab, setModalTab] = useState<'leaderboard' | 'words' | null>(null);
  const [initialRoomCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  // Keep URL query param synced with active room so users can share browser URL directly
  useEffect(() => {
    const url = new URL(window.location.href);
    if (roomState?.code) {
      url.searchParams.set('room', roomState.code);
      window.history.replaceState({}, '', url.toString());
    } else if (url.searchParams.has('room') && !initialRoomCode) {
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
  }, [roomState?.code, initialRoomCode]);

  return (
    <div className="min-h-screen bg-[#0E121A] text-[#F1F5F9] flex flex-col">
      {/* Compact 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 h-14 border-b border-white/[0.08] bg-[#0E121A]/90 backdrop-blur-md">
        <div className="mx-auto h-full w-full max-w-6xl px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setModalTab(null)}
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Khabri
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav className="flex items-center gap-5 sm:gap-7 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => {
                refreshLeaderboard();
                setModalTab('leaderboard');
              }}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Leaderboard
            </button>
            <button
              type="button"
              onClick={() => setModalTab('words')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Word Vault
            </button>
          </nav>

          {/* Zone 3: Single contextual action */}
          <div className="flex items-center shrink-0">
            {roomState ? (
              <span className="font-mono tabular-nums text-xs font-semibold text-amber-400 whitespace-nowrap shrink-0">
                Room {roomState.code}
              </span>
            ) : (
              <PWAInstallButton />
            )}
          </div>
        </div>
      </header>

      {/* Reconnection Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-center text-xs font-medium text-amber-300 flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Reconnecting to host room...</span>
        </div>
      )}

      {/* Main Game State Router */}
      <div className="flex-1">
        {!roomState ? (
          <HomeView
            initialRoomCode={initialRoomCode}
            wordStats={WORD_BANK_STATS}
            savedHostSnapshot={savedHostSnapshot}
            error={error}
            isConnecting={connectionStatus === 'connecting'}
            onCreateRoom={createHostRoom}
            onResumeHostRoom={resumeHostRoom}
            onJoinRoom={connectAndJoin}
            onOpenModal={(tab) => {
              if (tab === 'leaderboard') refreshLeaderboard();
              setModalTab(tab);
            }}
          />
        ) : roomState.phase === 'LOBBY' ? (
          <LobbyView
            room={roomState}
            playerId={playerId}
            error={error}
            onUpdateSettings={updateSettings}
            onStartRound={startRound}
            onKickPlayer={kickPlayer}
            onLeaveRoom={leaveRoom}
          />
        ) : roomState.phase === 'PLAYING' ? (
          <PlayView
            room={roomState}
            secret={secret}
            playerId={playerId}
            onSetReady={setReadyToVote}
            onOpenVoting={openVoting}
          />
        ) : roomState.phase === 'VOTING' ? (
          <VotingView
            room={roomState}
            secret={secret}
            playerId={playerId}
            onCastVote={castVote}
            onForceTally={forceTally}
          />
        ) : (
          <ResultsView
            room={roomState}
            playerId={playerId}
            onNextRound={startRound}
            onBackToLobby={backToLobby}
          />
        )}
      </div>

      {/* Modals & Offline Banner */}
      {modalTab && (
        <LeaderboardModal
          initialTab={modalTab}
          entries={leaderboard}
          onRefreshLeaderboard={refreshLeaderboard}
          onClose={() => setModalTab(null)}
          wordStats={WORD_BANK_STATS}
        />
      )}
      <OfflineIndicator />
    </div>
  );
}
