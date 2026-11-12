import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

/**
 * Single socket.io-client instance for the app (auto-reconnect built in).
 *
 * - joinQueue(queueId, role, displayKey?) emits queue:join { queueId?, role, displayKey? }
 *   and remembers the params so a reconnect re-subscribes automatically.
 * - leaveQueue(queueId?, displayKey?) emits queue:leave and forgets the subscription.
 * - subscribe(event, handler) / unsubscribe(event, handler) is a tiny event bus
 *   over the same socket — components use it for queue:updated, token:*, etc.
 * - `connected` state lets UIs render a connection status dot.
 * - `reconnect()` drops the current connection and re-handshakes. Needed when
 *   the auth context changes (login/logout, staff page <-> public display):
 *   the handshake auth is decided per connection, not per emit.
 *
 * AUTH: staff sockets authenticate with the httpOnly `token` cookie; the
 * public waiting-room display has no cookie, so when the current route is
 * /display/<32-hex-key> the handshake instead carries { role: 'display' }
 * and the server validates the key at queue:join time. Without this the
 * display handshake is rejected and the TV screen never gets live updates.
 */
export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const lastJoinsRef = useRef([]); // [{ queueId, role, displayKey }]
  const [connected, setConnected] = useState(false);

  if (!socketRef.current) {
    socketRef.current = io({
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      // Handshake auth is evaluated on every (re)connect. Staff pages rely
      // on the httpOnly cookie; the public display route has no cookie, so
      // it identifies itself as a display instead (server validates the
      // displayKey at queue:join time).
      auth: (cb) => {
        const m =
          typeof window !== 'undefined'
            ? window.location.pathname.match(/^\/display\/([0-9a-f]{32})$/i)
            : null;
        cb(m ? { role: 'display' } : {});
      },
    });
  }

  useEffect(() => {
    const socket = socketRef.current;
    const onConnect = () => {
      setConnected(true);
      // Re-subscribe every active join after a reconnect so rooms stay in sync.
      for (const j of lastJoinsRef.current) {
        socket.emit('queue:join', { queueId: j.queueId, role: j.role, displayKey: j.displayKey });
      }
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const joinQueue = useCallback((queueId, role, displayKey) => {
    const socket = socketRef.current;
    if (!socket) return;
    const join = { queueId: queueId ?? undefined, role, displayKey: displayKey ?? undefined };
    lastJoinsRef.current = [...lastJoinsRef.current.filter((j) => j.queueId !== queueId), join];
    if (socket.connected) socket.emit('queue:join', join);
  }, []);

  const leaveQueue = useCallback((queueId, displayKey) => {
    const socket = socketRef.current;
    if (!socket) return;
    lastJoinsRef.current = lastJoinsRef.current.filter(
      (j) => j.queueId !== queueId || (displayKey && j.displayKey !== displayKey)
    );
    if (socket.connected) socket.emit('queue:leave', { queueId, displayKey });
  }, []);

  const subscribe = useCallback((event, handler) => {
    const socket = socketRef.current;
    if (!socket || !handler) return () => {};
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, []);

  // Drop the current connection and re-handshake (re-evaluates the auth
  // callback above). Use after login/logout so a stale staff session — or a
  // stale anonymous one — doesn't linger in the wrong rooms.
  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.disconnect();
    socket.connect();
  }, []);

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      joinQueue,
      leaveQueue,
      subscribe,
      reconnect,
    }),
    [connected, joinQueue, leaveQueue, subscribe, reconnect]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx;
}
