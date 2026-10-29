import { create } from 'zustand';
import { APP_STEPS } from './types';
import type { AppRoute, AppStep, AuthUser, Exam, ToastItem } from './types';

export const STEP_INDEX = APP_STEPS.reduce<Record<AppStep, number>>(
  (acc, step, index) => ({ ...acc, [step.id]: index }),
  { login: 0, systemCheck: 1, faceVerify: 2, consent: 3, exam: 4, submitted: 5 },
);

interface Recording {
  camera: boolean;
  microphone: boolean;
  screen: boolean;
}

interface NewToast {
  tone: ToastItem['tone'];
  title: string;
  description?: string;
  durationMs?: number;
}

/**
 * App shell state: which screen is showing, who is signed in, device indicators and toasts.
 * Exam state and the violation policy live in the exam screen and on the server.
 */
interface AppState {
  step: AppStep;
  route: AppRoute;
  auth: AuthUser | null;
  exam: Exam | null;
  recording: Recording;
  online: boolean;
  latencyMs: number;
  lock: { active: boolean; reason: string | null };
  toasts: ToastItem[];
  devPanelOpen: boolean;

  signIn: (auth: AuthUser, exam?: Exam) => void;
  signOut: () => void;
  /** Normal navigation: forward one step at a time, or back to sign-in. */
  go: (step: AppStep) => boolean;
  /** Dev panel: open any step directly (the caller makes sure the server state allows it). */
  jump: (step: AppStep) => void;
  openMentor: (auth: AuthUser) => void;
  setRecording: (patch: Partial<Recording>) => void;
  setNetwork: (online: boolean, latencyMs: number) => void;
  setLock: (reason: string) => void;
  clearLock: () => void;
  pushToast: (toast: NewToast) => string;
  dismissToast: (id: string) => void;
  toggleDevPanel: (open?: boolean) => void;
  reset: () => void;
}

const NO_RECORDING: Recording = { camera: false, microphone: false, screen: false };
const ALL_RECORDING: Recording = { camera: true, microphone: true, screen: true };
const recordingFor = (step: AppStep): Recording => (step === 'exam' || step === 'consent' ? ALL_RECORDING : NO_RECORDING);

const initialState = () => ({
  step: 'login' as AppStep,
  route: 'candidate' as AppRoute,
  auth: null,
  exam: null,
  recording: NO_RECORDING,
  lock: { active: false, reason: null },
});

let toastSeq = 0;

export const useApp = create<AppState>()((set, get) => ({
  ...initialState(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  latencyMs: 0,
  toasts: [],
  devPanelOpen: false,

  signIn: (auth, exam) => set((s) => ({ auth, exam: exam ?? s.exam, route: auth.role === 'MENTOR' ? 'mentor' : 'candidate' })),
  signOut: () => set(initialState()),

  go: (step) => {
    const s = get();
    if (step === 'login') {
      set(initialState());
      return true;
    }
    if (STEP_INDEX[step] > STEP_INDEX[s.step] + 1) return false;
    set({ step, recording: step === 'submitted' ? NO_RECORDING : s.recording });
    return true;
  },

  jump: (step) => set({ step, route: 'candidate', recording: recordingFor(step), lock: { active: false, reason: null } }),
  openMentor: (auth) => set({ route: 'mentor', auth, recording: NO_RECORDING, lock: { active: false, reason: null } }),
  setRecording: (patch) => set((s) => ({ recording: { ...s.recording, ...patch } })),
  setNetwork: (online, latencyMs) => set({ online, latencyMs }),
  setLock: (reason) => set({ lock: { active: true, reason } }),
  clearLock: () => set({ lock: { active: false, reason: null } }),

  pushToast: (toast) => {
    const id = `toast_${++toastSeq}`;
    const durationMs = toast.durationMs ?? 5000;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id, durationMs }] }));
    window.setTimeout(() => get().dismissToast(id), durationMs);
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  toggleDevPanel: (open) => set((s) => ({ devPanelOpen: open ?? !s.devPanelOpen })),
  reset: () => set(initialState()),
}));
