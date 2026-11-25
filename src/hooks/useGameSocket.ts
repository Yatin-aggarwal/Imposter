import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  PublicRoomState,
  RoomSettings,
  SecretPlayerAssignment,
  ServerMessage,
} from '../types/game';

const PLAYER_ID_KEY = 'khabri_player_id';
const PLAYER_NAME_KEY = 'khabri_player_name';
const LAST_ROOM_KEY = 'khabri_last_room';

function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // Ignore storage errors
  }
}

export function getSavedRoomCode(): string {
  try {
    return localStorage.getItem(LAST_ROOM_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRoomCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(LAST_ROOM_KEY, code);
    else localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    // Ignore storage errors
  }
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function useGameSocket() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [secret, setSecret] = useState<SecretPlayerAssignment | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const activeSessionRef = useRef<{ roomCode: string; playerName: string } | null>(null);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current !== null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connectAndJoin = useCallback(
    (roomCode: string, playerName: string, isReconnect = false) => {
      const normalizedCode = roomCode.trim().toUpperCase();
      const trimmedName = playerName.trim();
      if (!normalizedCode || !trimmedName) return;

      activeSessionRef.current = { roomCode: normalizedCode, playerName: trimmedName };
      savePlayerName(trimmedName);
      saveRoomCode(normalizedCode);

      clearTimers();
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {
          // Ignore close error
        }
        wsRef.current = null;
      }

      setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');
      setError(null);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionStatus('connected');
        ws.send(
          JSON.stringify({
            type: 'room:join',
            roomCode: normalizedCode,
            playerId,
            playerName: trimmedName,
          } satisfies ClientMessage),
        );

        pingTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as ServerMessage;
          if (data.type === 'room:state') {
            setRoomState(data.state);
            setSecret(data.secret);
            setError(null);
          } else if (data.type === 'room:error') {
            setError(data.message);
            // If room does not exist on initial join, stop reconnecting
            if (data.message.includes('does not exist') || data.message.includes('already taken')) {
              activeSessionRef.current = null;
              saveRoomCode(null);
              ws.close();
              setConnectionStatus('idle');
            }
          } else if (data.type === 'room:kicked') {
            activeSessionRef.current = null;
            saveRoomCode(null);
            setRoomState(null);
            setSecret(null);
            setError(data.message);
            setConnectionStatus('idle');
            ws.close();
          }
        } catch {
          // Ignore malformed payload
        }
      };

      ws.onerror = () => {
        // Handled cleanly by onclose reconnect flow
      };

      ws.onclose = () => {
        clearTimers();
        const session = activeSessionRef.current;
        if (!session) {
          setConnectionStatus('idle');
          return;
        }
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(1.6, reconnectAttemptRef.current), 8000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          if (activeSessionRef.current) {
            connectAndJoin(activeSessionRef.current.roomCode, activeSessionRef.current.playerName, true);
          }
        }, delay);
      };
    },
    [clearTimers, playerId],
  );

  // Re-sync cleanly when mobile screen wakes up from lock/background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && activeSessionRef.current) {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          connectAndJoin(activeSessionRef.current.roomCode, activeSessionRef.current.playerName, true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connectAndJoin]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [clearTimers]);

  const leaveRoom = useCallback(() => {
    activeSessionRef.current = null;
    saveRoomCode(null);
    sendMessage({ type: 'room:leave' });
    clearTimers();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomState(null);
    setSecret(null);
    setError(null);
    setConnectionStatus('idle');
  }, [clearTimers, sendMessage]);

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      sendMessage({ type: 'room:update_settings', settings });
    },
    [sendMessage],
  );

  const startRound = useCallback(() => sendMessage({ type: 'room:start_round' }), [sendMessage]);
  const setReadyToVote = useCallback((ready: boolean) => sendMessage({ type: 'room:ready_to_vote', ready }), [sendMessage]);
  const openVoting = useCallback(() => sendMessage({ type: 'room:open_voting' }), [sendMessage]);
  const castVote = useCallback((targetId: string) => sendMessage({ type: 'room:cast_vote', targetId }), [sendMessage]);
  const forceTally = useCallback(() => sendMessage({ type: 'room:force_tally' }), [sendMessage]);
  const backToLobby = useCallback(() => sendMessage({ type: 'room:back_to_lobby' }), [sendMessage]);
  const kickPlayer = useCallback((targetId: string) => sendMessage({ type: 'room:kick_player', targetId }), [sendMessage]);

  return {
    playerId,
    roomState,
    secret,
    connectionStatus,
    error,
    clearError: () => setError(null),
    connectAndJoin,
    leaveRoom,
    updateSettings,
    startRound,
    setReadyToVote,
    openVoting,
    castVote,
    forceTally,
    backToLobby,
    kickPlayer,
  };
}
