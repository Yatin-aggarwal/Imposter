import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  GlobalLeaderboardEntry,
  PublicRoomState,
  RoomSettings,
  SecretPlayerAssignment,
  WordPack,
} from '../types/game';
import {
  getOrCreatePlayerId,
  getSavedPlayerName,
  getSavedRoomCode,
  loadGlobalLeaderboard,
  loadHostRoomSnapshot,
  savePlayerName,
  saveRoomCode,
  type PersistedHostSnapshot,
} from '../services/localStore';
import { GuestRoomClient, HostRoomController, type SessionCallbacks } from '../services/roomEngine';

export { getSavedPlayerName, savePlayerName, getSavedRoomCode, saveRoomCode };

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useGameSocket() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [secret, setSecret] = useState<SecretPlayerAssignment | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<GlobalLeaderboardEntry[]>(() => loadGlobalLeaderboard());
  const [savedHostSnapshot, setSavedHostSnapshot] = useState<PersistedHostSnapshot | null>(() =>
    loadHostRoomSnapshot(),
  );

  const hostRef = useRef<HostRoomController | null>(null);
  const guestRef = useRef<GuestRoomClient | null>(null);

  const teardownAll = useCallback((clearHostSnapshot = false) => {
    if (hostRef.current) {
      hostRef.current.destroy(clearHostSnapshot);
      hostRef.current = null;
    }
    if (guestRef.current) {
      guestRef.current.destroy();
      guestRef.current = null;
    }
  }, []);

  const buildCallbacks = useCallback(
    (): SessionCallbacks => ({
      onState: (state, nextSecret) => {
        setRoomState(state);
        setSecret(nextSecret);
        setError(null);
      },
      onStatus: (status) => {
        setConnectionStatus(status);
      },
      onError: (msg) => {
        setError(msg);
      },
      onKicked: (msg) => {
        saveRoomCode(null);
        setRoomState(null);
        setSecret(null);
        setConnectionStatus('idle');
        setError(msg);
      },
      onLeaderboardChanged: (entries) => {
        setLeaderboard(entries);
      },
    }),
    [],
  );

  const createHostRoom = useCallback(
    (playerName: string, wordPack: WordPack) => {
      const trimmedName = playerName.trim();
      if (!trimmedName) return;

      teardownAll(true);
      savePlayerName(trimmedName);
      setError(null);

      const controller = new HostRoomController(
        {
          hostId: playerId,
          hostName: trimmedName,
          settings: {
            wordPack,
            imposterCount: 1,
          },
        },
        buildCallbacks(),
      );
      hostRef.current = controller;
      saveRoomCode(controller.code);
      setSavedHostSnapshot(loadHostRoomSnapshot());
    },
    [buildCallbacks, playerId, teardownAll],
  );

  const resumeHostRoom = useCallback(() => {
    const snap = loadHostRoomSnapshot();
    if (!snap) return;

    teardownAll(false);
    setError(null);

    const controller = new HostRoomController(
      {
        hostId: playerId,
        hostName: snap.hostPlayerName,
        settings: snap.settings,
        restoreSnapshot: snap,
      },
      buildCallbacks(),
    );
    hostRef.current = controller;
    saveRoomCode(controller.code);
  }, [buildCallbacks, playerId, teardownAll]);

  const connectAndJoin = useCallback(
    (roomCode: string, playerName: string) => {
      const normalizedCode = roomCode.trim().toUpperCase();
      const trimmedName = playerName.trim();
      if (!normalizedCode || !trimmedName) return;

      teardownAll(false);
      savePlayerName(trimmedName);
      saveRoomCode(normalizedCode);
      setError(null);

      guestRef.current = new GuestRoomClient(normalizedCode, playerId, trimmedName, buildCallbacks());
    },
    [buildCallbacks, playerId, teardownAll],
  );

  const sendAction = useCallback((msg: ClientMessage) => {
    if (hostRef.current) {
      hostRef.current.sendHostAction(msg);
    } else if (guestRef.current) {
      guestRef.current.send(msg);
    }
  }, []);

  // Recover host & guest connections cleanly when mobile screen wakes from lock/WhatsApp or network returns
  useEffect(() => {
    const handleRecover = () => {
      if (document.visibilityState === 'visible') {
        hostRef.current?.reconnectIfDropped();
        guestRef.current?.reconnectIfDropped();
      }
    };
    document.addEventListener('visibilitychange', handleRecover);
    window.addEventListener('online', handleRecover);
    return () => {
      document.removeEventListener('visibilitychange', handleRecover);
      window.removeEventListener('online', handleRecover);
    };
  }, []);

  // Clean up transports on unmount without wiping host recovery snapshot
  useEffect(() => {
    return () => {
      teardownAll(false);
    };
  }, [teardownAll]);

  const leaveRoom = useCallback(() => {
    if (guestRef.current) {
      guestRef.current.send({ type: 'room:leave' });
    }
    teardownAll(true);
    saveRoomCode(null);
    setSavedHostSnapshot(null);
    setRoomState(null);
    setSecret(null);
    setError(null);
    setConnectionStatus('idle');
  }, [teardownAll]);

  const refreshLeaderboard = useCallback(() => {
    setLeaderboard(loadGlobalLeaderboard());
  }, []);

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => sendAction({ type: 'room:update_settings', settings }),
    [sendAction],
  );

  const startRound = useCallback(() => sendAction({ type: 'room:start_round' }), [sendAction]);
  const castVote = useCallback((targetId: string) => sendAction({ type: 'room:cast_vote', targetId }), [sendAction]);
  const backToLobby = useCallback(() => sendAction({ type: 'room:back_to_lobby' }), [sendAction]);

  return {
    playerId,
    roomState,
    secret,
    connectionStatus,
    error,
    leaderboard,
    savedHostSnapshot,
    clearError: () => setError(null),
    createHostRoom,
    resumeHostRoom,
    connectAndJoin,
    leaveRoom,
    refreshLeaderboard,
    updateSettings,
    startRound,
    castVote,
    backToLobby,
  };
}
