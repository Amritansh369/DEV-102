import { useEffect, useState } from 'react';
import { Check, Copy, Minus, ShieldCheck, Square, Wifi, WifiOff, X, Eye } from 'lucide-react';
import { APP_STEPS } from '../lib/types';
import type { AppStep } from '../lib/types';
import { useApp, STEP_INDEX } from '../lib/store';
import { getProctor } from '../lib/proctorMock';
import { Badge, Button, Logo, Modal, cn } from '../lib/ui';

/** Window-control hook backed by window.proctor (or the browser mock). */
export function useWindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = getProctor();
    let alive = true;
    void api.window.isMaximized().then((value) => {
      if (alive) setMaximized(value);
    });
    const off = api.window.onMaximizeChange(setMaximized);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return {
    maximized,
    minimize: (): void => void getProctor().window.minimize(),
    toggleMaximize: (): void => void getProctor().window.toggleMaximize().then(setMaximized),
    close: (): void => void getProctor().window.close(),
  };
}

const PROCTOR_STEPS: readonly { id: string; label: string }[] = [
  { id: 'login', label: 'Sign in' },
  { id: 'faceVerify', label: 'Verify identity' },
  { id: 'monitor', label: 'Live monitor' },
];

/** Steps for the role the join link is for; nothing until a link is pasted. */
function StepProgress({ current, role }: { current: AppStep; role: 'CANDIDATE' | 'MENTOR' | null }) {
  if (!role) return null;
  const steps = role === 'MENTOR' ? PROCTOR_STEPS : APP_STEPS;
  const index = role === 'MENTOR' ? Math.max(0, PROCTOR_STEPS.findIndex((s) => s.id === current)) : STEP_INDEX[current];
  return (
    <ol aria-label={role === 'MENTOR' ? 'Proctor sign-in progress' : 'Exam setup progress'} className="flex items-center gap-1">
      {steps.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={step.id} aria-current={active ? 'step' : undefined} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition',
                done && 'bg-success text-white',
                active && 'bg-primary-600 text-white ring-4 ring-blue-100',
                !done && !active && 'bg-slate-100 text-muted',
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
            </span>
            <span className={cn('hidden text-xs xl:inline', active ? 'font-semibold text-text' : 'text-muted')}>{step.label}</span>
            {i < steps.length - 1 && <span aria-hidden className={cn('mx-1 h-px w-4', done ? 'bg-success' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
}

function ConnectionBadge() {
  const online = useApp((s) => s.online);
  const latency = useApp((s) => s.latencyMs);
  if (!online) {
    return (
      <Badge tone="danger" dot pulse>
        <WifiOff className="h-3 w-3" aria-hidden /> Offline
      </Badge>
    );
  }
  return (
    <Badge tone={latency > 150 ? 'warning' : 'success'}>
      <Wifi className="h-3 w-3" aria-hidden /> <span className="tabular-nums">{latency} ms</span>
    </Badge>
  );
}

function RecordingBadge() {
  const rec = useApp((s) => s.recording);
  const active = rec.camera || rec.screen || rec.microphone;
  if (!active) return <Badge tone="neutral">Not recording</Badge>;
  const parts = [rec.camera && 'Cam', rec.microphone && 'Mic', rec.screen && 'Screen'].filter(Boolean).join(' · ');
  return (
    <Badge tone="danger" dot pulse>
      REC · {parts}
    </Badge>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function AppHeader() {
  const step = useApp((s) => s.step);
  const route = useApp((s) => s.route);
  const auth = useApp((s) => s.auth);
  const exam = useApp((s) => s.exam);
  const joinRole = useApp((s) => s.joinRole);
  const stepRole = auth ? (auth.role === 'MENTOR' ? 'MENTOR' : 'CANDIDATE') : joinRole;
  const controls = useWindowControls();
  const [closeOpen, setCloseOpen] = useState(false);
  const inExam = route === 'candidate' && step === 'exam';

  return (
    <>
      <header className="drag-region relative z-30 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/95 pl-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-4">
          <Logo size={26} />
          {exam && route === 'candidate' && (
            <span className="hidden max-w-[260px] truncate rounded-md bg-soft px-2 py-1 text-xs text-muted lg:inline" title={exam.title}>
              {exam.code}
            </span>
          )}
        </div>

        <div className="no-drag hidden md:block">
          {route === 'mentor' ? (
            <Badge tone="info" dot pulse>
              <Eye className="h-3 w-3" aria-hidden /> Live monitoring
            </Badge>
          ) : (
            <StepProgress current={step} role={stepRole} />
          )}
        </div>

        <div className="flex items-center">
          <div className="no-drag mr-3 flex items-center gap-2">
            <ConnectionBadge />
            {route === 'candidate' && <RecordingBadge />}
            {auth && (
              <div className="ml-1 flex items-center gap-2" title={`${auth.name} · ${auth.role}`}>
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                  {initials(auth.name)}
                </span>
                <span className="hidden text-xs font-medium xl:inline">{auth.name}</span>
              </div>
            )}
          </div>
          <div className="no-drag flex h-12">
            <button type="button" aria-label="Minimize window" disabled={inExam} onClick={controls.minimize} className="w-11 text-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
              <Minus className="mx-auto h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label={controls.maximized ? 'Restore window' : 'Maximize window'} disabled={inExam} onClick={controls.toggleMaximize} className="w-11 text-muted transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
              {controls.maximized ? <Copy className="mx-auto h-3.5 w-3.5" aria-hidden /> : <Square className="mx-auto h-3.5 w-3.5" aria-hidden />}
            </button>
            <button type="button" aria-label="Close application" onClick={() => setCloseOpen(true)} className="w-11 text-muted transition hover:bg-danger hover:text-white">
              <X className="mx-auto h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        size="sm"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        title={inExam ? 'You can’t exit during the exam' : 'Close the secure exam browser?'}
        description={
          inExam
            ? 'The app is locked while your exam is running. Submit your exam from the question screen to finish.'
            : 'You will need to sign in again with your Exam ID and User ID.'
        }
        footer={
          inExam ? (
            <Button onClick={() => setCloseOpen(false)}>Back to exam</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setCloseOpen(false)}>
                Stay
              </Button>
              <Button variant="danger" onClick={controls.close}>
                Close app
              </Button>
            </>
          )
        }
      />
    </>
  );
}
