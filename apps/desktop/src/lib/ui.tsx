import {
  Component,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XOctagon, X, Inbox } from 'lucide-react';
import type { Severity, ToastItem } from './types';
import { useApp } from './store';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Resolves public assets so they work under both http:// (dev) and file:// (packaged). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

// ---------- Button ----------
export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary',
  cta: 'bg-cta text-text font-semibold shadow-sm hover:brightness-95',
  secondary: 'bg-surface text-primary border border-border hover:bg-soft',
  ghost: 'text-muted hover:bg-slate-100 hover:text-text',
  danger: 'bg-danger text-white shadow-sm hover:brightness-95',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------- Card ----------
export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={cn('rounded-2xl border border-border bg-surface shadow-card', padded && 'p-6', className)}>{children}</div>;
}

// ---------- Badge ----------
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'cta';

const BADGE_TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-slate-100 text-muted ring-slate-200', dot: 'bg-slate-400' },
  info: { box: 'bg-blue-50 text-primary-600 ring-blue-100', dot: 'bg-accent' },
  success: { box: 'bg-green-50 text-success ring-green-100', dot: 'bg-success' },
  warning: { box: 'bg-amber-50 text-amber-700 ring-amber-100', dot: 'bg-warning' },
  danger: { box: 'bg-red-50 text-danger ring-red-100', dot: 'bg-danger' },
  cta: { box: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-cta' },
};

export const SEVERITY_TONE: Record<Severity, BadgeTone> = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };

export function Badge({ tone = 'neutral', dot = false, pulse = false, className, children }: { tone?: BadgeTone; dot?: boolean; pulse?: boolean; className?: string; children: ReactNode }) {
  const styles = BADGE_TONES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', styles.box, className)}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', styles.dot, pulse && 'animate-rec')} />}
      {children}
    </span>
  );
}

// ---------- ProgressBar ----------
export function ProgressBar({ value, max = 100, tone = 'info', label, showValue = false, className }: { value: number; max?: number; tone?: 'info' | 'success' | 'warning' | 'danger'; label: string; showValue?: boolean; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill = { info: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <motion.div className={cn('h-full rounded-full', fill)} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
      </div>
      {showValue && <span className="w-10 text-right text-xs font-medium tabular-nums text-muted">{Math.round(pct)}%</span>}
    </div>
  );
}

// ---------- Spinner / Skeleton / states ----------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-label="Loading" className={cn('h-5 w-5 animate-spin text-accent', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

export function ScreenSkeleton() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-10" role="status" aria-label="Loading screen">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-accent">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {onRetry && (
        <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  resetKey?: string;
}
interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidUpdate(previous: BoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto flex h-full max-w-xl items-center p-8">
          <ErrorState title="This screen hit a problem" description={this.state.error.message} onRetry={() => this.setState({ error: null })} />
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Logo ----------
export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      {failed ? (
        <span aria-hidden style={{ width: size, height: size }} className="flex items-center justify-center rounded-lg bg-primary-600 font-heading text-sm font-bold text-white">
          W
        </span>
      ) : (
        <img src={asset('images/logo.png')} alt="Where U Elevate" height={size} style={{ height: size }} onError={() => setFailed(true)} />
      )}
      {withText && <span className="font-heading text-sm font-semibold text-primary">Secure Exam Browser</span>}
    </span>
  );
}

// ---------- Modal ----------
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, description, icon, children, footer, size = 'md', dismissible = true }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = (): HTMLElement[] => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (focusable()[0] ?? panel)?.focus();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, dismissible]);

  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn('relative w-full rounded-2xl border border-border bg-surface p-6 shadow-pop', width)}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-3">
              {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-soft text-accent">{icon}</div>}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                {description && <p id={descId} className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              {dismissible && (
                <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-text">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            {children && <div className="mt-4 text-sm">{children}</div>}
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------- Toasts ----------
const TOAST_STYLE: Record<ToastItem['tone'], { icon: ReactNode; bar: string }> = {
  info: { icon: <Info className="h-5 w-5 text-accent" aria-hidden />, bar: 'bg-accent' },
  success: { icon: <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />, bar: 'bg-success' },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />, bar: 'bg-warning' },
  danger: { icon: <XOctagon className="h-5 w-5 text-danger" aria-hidden />, bar: 'bg-danger' },
};

export function ToastViewport() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-14 z-[100] flex w-[360px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = TOAST_STYLE[toast.tone];
          return (
            <motion.div
              key={toast.id}
              layout
              role={toast.tone === 'danger' || toast.tone === 'warning' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
              className="pointer-events-auto relative flex gap-3 overflow-hidden rounded-xl border border-border bg-surface p-3 pr-2 shadow-pop"
            >
              <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', style.bar)} />
              <div className="mt-0.5 pl-1">{style.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs text-muted">{toast.description}</p>}
              </div>
              <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="h-7 w-7 shrink-0 rounded-lg text-muted transition hover:bg-slate-100">
                <X className="mx-auto h-4 w-4" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
