import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Clock, Lock, Mic, Monitor } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { ReconnectBanner, useConnectivity } from './ReconnectBanner';

function ConnectivityNotice() {
  const { state, retryNow } = useConnectivity({ queuedCount: 0, flush: async () => undefined });
  return <ReconnectBanner state={state} queuedCount={0} onRetryNow={retryNow} />;
}
import { useApp } from '../lib/store';
import { getProctor } from '../lib/proctorMock';
import { Button, cn } from '../lib/ui';
import { api } from '../lib/api';

/** Tracks connectivity and measures real latency to the API every 15 seconds. */
function useNetworkMonitor(): void {
  const setNetwork = useApp((s) => s.setNetwork);
  useEffect(() => {
    const ping = async (): Promise<void> => {
      const r = await api.serverStatus();
      setNetwork(navigator.onLine && r.online, r.latencyMs);
    };
    const offline = (): void => setNetwork(false, 0);
    const online = (): void => void ping();
    void ping();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    const timer = window.setInterval(() => void ping(), 15000);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.clearInterval(timer);
    };
  }, [setNetwork]);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function WallClock() {
  const now = useNow(15000);
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {new Date(now).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

function Indicator({ icon, label, on }: { icon: ReactNode; label: string; on: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1', on ? 'text-success' : 'text-slate-400')} title={`${label}: ${on ? 'active' : 'inactive'}`}>
      {icon}
      <span className="sr-only">{`${label} ${on ? 'active' : 'inactive'}`}</span>
    </span>
  );
}

function StatusBar() {
  const exam = useApp((s) => s.exam);
  const auth = useApp((s) => s.auth);
  const rec = useApp((s) => s.recording);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface px-4 text-[11px] text-muted">
      <div className="flex items-center gap-3">
        <span className="font-medium text-primary">v{__APP_VERSION__}</span>
        {!getProctor().native && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Browser preview (no native guards)</span>}
        {auth && <span className="hidden lg:inline">{auth.name}</span>}
      </div>
      <div className="flex items-center gap-4">
        {exam && <span className="hidden md:inline">{exam.title} · {exam.code}</span>}
      </div>
      <div className="flex items-center gap-3">
        <Indicator on={rec.camera} label="Camera" icon={<Camera className="h-3.5 w-3.5" aria-hidden />} />
        <Indicator on={rec.microphone} label="Microphone" icon={<Mic className="h-3.5 w-3.5" aria-hidden />} />
        <Indicator on={rec.screen} label="Screen share" icon={<Monitor className="h-3.5 w-3.5" aria-hidden />} />
        <WallClock />
      </div>
    </footer>
  );
}

function KioskLock() {
  const lock = useApp((s) => s.lock);
  const clearLock = useApp((s) => s.clearLock);
  return (
    <AnimatePresence>
      {lock.active && (
        <motion.div className="kiosk-lock" role="alertdialog" aria-modal="true" aria-labelledby="kiosk-lock-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-pop">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-warning">
              <Lock className="h-7 w-7" aria-hidden />
            </div>
            <h2 id="kiosk-lock-title" className="mt-4 text-xl font-semibold">
              Exam paused
            </h2>
            <p className="mt-2 text-sm text-muted">{lock.reason ?? 'The exam window lost focus.'} This event has been recorded and your proctor can see it.</p>
            <Button autoFocus className="mt-6" size="lg" onClick={clearLock}>
              Return to exam
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DesktopLayout({ children }: { children: ReactNode }) {
  useNetworkMonitor();
  return (
    <div className="flex h-screen min-h-[700px] min-w-[1100px] flex-col bg-soft">
      <AppHeader />
      <ConnectivityNotice />
      <main className="dot-pattern relative min-h-0 flex-1 overflow-hidden">{children}</main>
      <StatusBar />
      <KioskLock />
    </div>
  );
}
