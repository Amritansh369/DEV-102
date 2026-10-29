import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CloudUpload, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { announce, focusRing, useReducedMotion } from '../lib/a11y';

/* ───────────────────────── Connectivity state machine ───────────────────────── */

export type ConnectionPhase = 'ONLINE' | 'OFFLINE' | 'RECONNECTING' | 'SYNCING' | 'SYNCED';

export interface ConnectivityState {
  phase: ConnectionPhase;
  synced: number;
  total: number;
  attempt: number;
  nextRetryInSec: number;
  offlineSince: number | null;
}

export interface UseConnectivityOptions {
  /** Number of locally queued changes (answers, events) waiting to be sent. */
  queuedCount: number;
  /** Resolves true when the server is reachable. Defaults to navigator.onLine. */
  probe?: () => Promise<boolean>;
  /** Sends the queue. Call onProgress(done, total) as items are accepted. */
  flush: (onProgress: (done: number, total: number) => void) => Promise<void>;
  onPhaseChange?: (phase: ConnectionPhase) => void;
}

const BACKOFF_SEC: readonly number[] = [3, 6, 12, 24, 30];
const backoff = (attempt: number): number => BACKOFF_SEC[Math.min(attempt, BACKOFF_SEC.length - 1)] ?? 30;
const defaultProbe = async (): Promise<boolean> => navigator.onLine;

export function useConnectivity(options: UseConnectivityOptions): {
  state: ConnectivityState;
  retryNow: () => void;
  /** Lets mock mode demo the offline flow without touching the real network. */
  forceOffline: () => void;
} {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [state, setState] = useState<ConnectivityState>(() => ({
    phase: navigator.onLine ? 'ONLINE' : 'OFFLINE',
    synced: 0,
    total: 0,
    attempt: 0,
    nextRetryInSec: backoff(0),
    offlineSince: navigator.onLine ? null : Date.now(),
  }));
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const forcedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    optionsRef.current.onPhaseChange?.(state.phase);
  }, [state.phase]);

  const attempt = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState((s) => ({ ...s, phase: 'RECONNECTING' }));

    let reachable = false;
    try {
      reachable = forcedRef.current ? false : await (optionsRef.current.probe ?? defaultProbe)();
    } catch {
      reachable = false;
    }
    if (!reachable) {
      busyRef.current = false;
      setState((s) => ({ ...s, phase: 'OFFLINE', attempt: s.attempt + 1, nextRetryInSec: backoff(s.attempt + 1) }));
      return;
    }

    const total = optionsRef.current.queuedCount;
    setState((s) => ({ ...s, phase: 'SYNCING', synced: 0, total }));
    try {
      if (total > 0) {
        await optionsRef.current.flush((done, t) => setState((s) => ({ ...s, synced: done, total: t })));
      }
      setState((s) => ({ ...s, phase: 'SYNCED', synced: s.total, attempt: 0, nextRetryInSec: backoff(0), offlineSince: null }));
    } catch {
      setState((s) => ({ ...s, phase: 'OFFLINE', attempt: s.attempt + 1, nextRetryInSec: backoff(s.attempt + 1) }));
    } finally {
      busyRef.current = false;
    }
  }, []);

  const markOffline = useCallback((): void => {
    if (busyRef.current) return;
    setState((s) =>
      s.phase === 'OFFLINE'
        ? s
        : { ...s, phase: 'OFFLINE', attempt: 0, nextRetryInSec: backoff(0), offlineSince: s.offlineSince ?? Date.now() },
    );
  }, []);

  useEffect(() => {
    const onOffline = (): void => markOffline();
    const onOnline = (): void => {
      forcedRef.current = false;
      if (stateRef.current.phase !== 'ONLINE') void attempt();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [attempt, markOffline]);

  // One-second heartbeat drives the retry countdown and the "synced" auto-dismiss.
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = stateRef.current;
      if (current.phase === 'OFFLINE') {
        if (current.nextRetryInSec <= 1) void attempt();
        else setState((s) => ({ ...s, nextRetryInSec: s.nextRetryInSec - 1 }));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    if (state.phase !== 'SYNCED') return;
    const id = window.setTimeout(() => setState((s) => (s.phase === 'SYNCED' ? { ...s, phase: 'ONLINE' } : s)), 3500);
    return () => window.clearTimeout(id);
  }, [state.phase]);

  return {
    state,
    retryNow: () => void attempt(),
    forceOffline: () => {
      forcedRef.current = true;
      markOffline();
    },
  };
}

/* ───────────────────────── Banner ───────────────────────── */

export interface ReconnectBannerProps {
  state: ConnectivityState;
  queuedCount: number;
  onRetryNow: () => void;
}

const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const toneByPhase: Record<Exclude<ConnectionPhase, 'ONLINE'>, string> = {
  OFFLINE: 'border-red-200 bg-red-50 text-danger',
  RECONNECTING: 'border-amber-200 bg-amber-50 text-warning',
  SYNCING: 'border-blue-200 bg-blue-50 text-primary',
  SYNCED: 'border-green-200 bg-green-50 text-success',
};

export function ReconnectBanner({ state, queuedCount, onRetryNow }: ReconnectBannerProps) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const { phase } = state;

  useEffect(() => {
    if (phase !== 'OFFLINE' && phase !== 'RECONNECTING') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'OFFLINE') announce('You are offline. Answers are saved on this device.', 'assertive');
    else if (phase === 'SYNCED') announce('Back online. Everything is synced.');
  }, [phase]);

  const percent = state.total > 0 ? Math.round((state.synced / state.total) * 100) : 100;

  return (
    <AnimatePresence initial={false}>
      {phase !== 'ONLINE' && (
        <motion.div
          key="reconnect-banner"
          role="status"
          aria-live={phase === 'OFFLINE' ? 'assertive' : 'polite'}
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.2 }}
          className="overflow-hidden"
        >
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2.5 ${toneByPhase[phase]}`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70">
              {phase === 'OFFLINE' && <WifiOff className="h-4 w-4" aria-hidden />}
              {phase === 'RECONNECTING' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {phase === 'SYNCING' && <CloudUpload className="h-4 w-4" aria-hidden />}
              {phase === 'SYNCED' && <CheckCircle2 className="h-4 w-4" aria-hidden />}
            </span>

            <div className="min-w-0 flex-1 text-sm">
              {phase === 'OFFLINE' && (
                <>
                  <p className="font-semibold">
                    You are offline{state.offlineSince ? ` for ${formatElapsed(now - state.offlineSince)}` : ''}
                  </p>
                  <p className="text-xs opacity-90">
                    Your answers are saved on this device
                    {queuedCount > 0 ? ` — ${queuedCount} change${queuedCount === 1 ? '' : 's'} waiting to sync` : ''}. The timer
                    keeps running. Retrying in {state.nextRetryInSec}s (attempt {state.attempt + 1}).
                  </p>
                </>
              )}
              {phase === 'RECONNECTING' && (
                <>
                  <p className="font-semibold">Reconnecting to the exam server…</p>
                  <p className="text-xs opacity-90">Please stay on this screen. Do not close the app.</p>
                </>
              )}
              {phase === 'SYNCING' && (
                <>
                  <p className="font-semibold">
                    Syncing {state.synced} of {state.total} saved change{state.total === 1 ? '' : 's'}
                  </p>
                  <div
                    role="progressbar"
                    aria-label="Sync progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    className="mt-1.5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/70"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${percent}%`, transition: reduced ? 'none' : 'width 200ms ease-out' }}
                    />
                  </div>
                </>
              )}
              {phase === 'SYNCED' && (
                <>
                  <p className="font-semibold">Back online</p>
                  <p className="text-xs opacity-90">
                    {state.total > 0 ? `${state.total} saved change${state.total === 1 ? '' : 's'} synced.` : 'Nothing was waiting to sync.'}
                  </p>
                </>
              )}
            </div>

            {phase === 'OFFLINE' && (
              <button
                type="button"
                onClick={onRetryNow}
                className={`inline-flex items-center gap-2 rounded-xl border border-current bg-white/80 px-3 py-1.5 text-xs font-semibold hover:bg-white ${focusRing}`}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry now
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
