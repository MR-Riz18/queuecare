import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Maximize, Minimize, Wifi, WifiOff } from 'lucide-react';
import { displayApi } from '../api/displayApi';
import { useSocket } from '../context/SocketContext';

/**
 * PUBLIC waiting-room TV screen — no login, no navbar.
 * URL: /display/:displayKey (32-hex key; never guessable).
 *
 * PRIVACY: only token numbers, room names, calledAt, waiting count,
 * clinic name and announcement are rendered. Backend never sends
 * patient names/phones/notes here — no such fields are referenced.
 *
 * Live: joins with { displayKey, role: 'display' }; display:snapshot
 * arrives right after join, then display:updated-style token:* events.
 * Reconnect re-joins automatically via SocketContext.
 */
export default function Display() {
  const { displayKey } = useParams();
  const { joinQueue, leaveQueue, subscribe, connected, socket } = useSocket();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const prevCurrent = useRef(null);

  const fetchSnapshot = useCallback(async () => {
    if (!displayKey) return;
    try {
      const d = await displayApi.snapshot(displayKey);
      setData(d);
      setError('');
    } catch (e) {
      if (e?.response?.status === 404) setError('This display link is invalid.');
      else setError(e.message || 'Could not load display data.');
    } finally {
      setLoading(false);
    }
  }, [displayKey]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  // Subscribe to the display room for live updates.
  useEffect(() => {
    if (!displayKey) return;
    joinQueue(undefined, 'display', displayKey);
    const unsubs = [
      // Full snapshot pushed right after join (and on demand).
      subscribe('display:snapshot', (payload) => {
        setData(payload);
        setLoading(false);
        setError('');
      }),
    ];
    const tokenEvents = ['token:called', 'token:recalled', 'token:serving', 'token:completed'];
    tokenEvents.forEach((ev) => {
      unsubs.push(
        subscribe(ev, (p) => {
          setPulseKey((k) => k + 1);
          fetchSnapshot();
        })
      );
    });
    // The server only forwards called/recalled/serving as token events to
    // display rooms; complete / cancel / skip arrive as `queue:updated`.
    // Without this the screen keeps showing a finished token.
    unsubs.push(subscribe('queue:updated', () => fetchSnapshot()));
    return () => {
      unsubs.forEach((u) => u());
      leaveQueue(undefined, displayKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey]);

  // Pulse the current-token card when it changes.
  useEffect(() => {
    const cur = data?.currentCalled?.tokenNumber;
    if (cur && prevCurrent.current && prevCurrent.current !== cur) setPulseKey((k) => k + 1);
    prevCurrent.current = cur;
  }, [data?.currentCalled?.tokenNumber]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const current = data?.currentCalled;
  const recent = (data?.recentlyCalled || []).slice(0, 6);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-100 to-teal-50 text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-4 text-white shadow-lg shadow-slate-900/20 sm:px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{data?.clinicName || 'QueueCare'}</h1>
          <p className="text-sm text-slate-400">{data?.serviceDate ? `Today · ${data.serviceDate}` : 'Live queue display'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? 'Connected' : 'Reconnecting…'}
          </span>
          <button
            onClick={toggleFullscreen}
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {data?.announcement && (
        <div className="border-b border-teal-100 bg-teal-600 px-4 py-3 text-center text-white sm:px-8">
          <p className="text-base font-medium sm:text-lg">{data.announcement}</p>
        </div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        {loading ? (
          <div className="animate-pulse text-center">
            <div className="mx-auto h-8 w-64 rounded bg-slate-200" />
            <div className="mx-auto mt-6 h-40 w-72 rounded-3xl bg-slate-200" />
          </div>
        ) : error ? (
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-700">{error}</p>
            <p className="mt-2 text-slate-500">Please check the display link with reception.</p>
          </div>
        ) : current ? (
          <div key={pulseKey} className="w-full max-w-3xl animate-token-pulse rounded-3xl bg-white px-6 py-10 text-center shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 sm:px-12">
            <p className="text-xl font-semibold uppercase tracking-[0.3em] text-teal-700 sm:text-2xl">
              Current token
            </p>
            <p className="mt-4 font-mono text-8xl font-black tracking-tight text-slate-900 sm:text-[10rem]">
              {current.tokenNumber}
            </p>
            <p className="mt-6 text-2xl font-semibold uppercase tracking-[0.2em] text-slate-600 sm:text-3xl">
              Please proceed to
            </p>
            <p className="mt-2 text-5xl font-bold text-teal-700 sm:text-7xl">
              {current.roomName || 'Counter'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-700 sm:text-5xl">Please wait for your token</p>
            <p className="mt-3 text-lg text-slate-500">No token is being called right now.</p>
          </div>
        )}

        {/* Recently called */}
        {!loading && !error && recent.length > 0 && (
          <div className="mt-12 w-full max-w-3xl">
            <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
              Recently called
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recent.map((r, i) => (
                <div
                  key={`${r.tokenNumber}-${i}`}
                  className="rounded-2xl border border-teal-100 bg-white/80 px-4 py-3 text-center shadow-sm"
                >
                  <p className="font-mono text-2xl font-bold text-slate-900">{r.tokenNumber}</p>
                  <p className="mt-1 text-sm font-medium text-teal-700">{r.roomName || 'Counter'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Waiting count */}
        {!loading && !error && (
          <div className="mt-10 rounded-2xl bg-slate-900 px-8 py-4 text-center shadow-lg">
            <p className="text-sm uppercase tracking-widest text-slate-400">Waiting</p>
            <p className="text-4xl font-bold text-white">{data?.waitingCount ?? 0}</p>
          </div>
        )}
      </main>

      <footer className="bg-slate-900 px-4 py-3 text-center text-xs text-slate-400 sm:px-8">
        Powered by QueueCare · Please keep your token number handy
      </footer>
    </div>
  );
}
