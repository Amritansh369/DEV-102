'use client';

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Inbox,
  Info,
  Loader2,
  Minus,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  buttonStyles,
  cn,
  type ButtonSize,
  type ButtonVariant,
} from '@/lib/ui';
import type { Severity } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth,
    leftIcon,
    rightIcon,
    className,
    disabled,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  padded = true,
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/70 bg-surface shadow-card',
        padded && 'p-6',
        interactive &&
          'transition duration-200 hover:-translate-y-0.5 hover:border-primary-100 hover:shadow-pop',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

const fieldBase =
  'w-full rounded-xl border bg-surface text-sm text-ink transition placeholder:text-muted/70 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-soft disabled:text-muted';
const fieldOk = 'border-border focus:border-accent focus:ring-accent/15';
const fieldBad = 'border-danger focus:border-danger focus:ring-danger/15';

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, wrapperClassName, className, id, required, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted [&_svg]:h-4 [&_svg]:w-4">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className={cn(
            fieldBase,
            error ? fieldBad : fieldOk,
            'h-11 px-3.5',
            leftIcon && 'pl-10',
            rightSlot && 'pr-11',
            className,
          )}
          {...rest}
        />
        {rightSlot ? (
          <span className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</span>
        ) : null}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, wrapperClassName, className, id, required, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(fieldBase, error ? fieldBad : fieldOk, 'resize-y px-3.5 py-2.5', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, wrapperClassName, className, id, required, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={wrapperClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className={cn(fieldBase, error ? fieldBad : fieldOk, 'h-11 appearance-none pl-3.5 pr-10', className)}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate = false, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const inner = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative mt-0.5 flex h-5 w-5 shrink-0">
        <input
          ref={setRef}
          id={fieldId}
          type="checkbox"
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-border bg-surface transition checked:border-primary-600 checked:bg-primary-600 indeterminate:border-primary-600 indeterminate:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          {...rest}
        />
        {indeterminate ? (
          <Minus className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white" aria-hidden />
        ) : (
          <Check
            className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white opacity-0 transition peer-checked:opacity-100"
            strokeWidth={3}
            aria-hidden
          />
        )}
      </span>
      {label || description ? (
        <label htmlFor={fieldId} className="cursor-pointer text-sm leading-5">
          {label ? <span className="font-medium text-ink">{label}</span> : null}
          {description ? <span className="mt-0.5 block text-muted">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
});

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const labelId = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {label || description ? (
        <div className="text-sm leading-5">
          {label ? (
            <span id={labelId} className="font-medium text-ink">
              {label}
            </span>
          ) : null}
          {description ? <p className="mt-0.5 text-muted">{description}</p> : null}
        </div>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition focus-ring disabled:opacity-50',
          checked ? 'bg-primary-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge, Avatar, Tooltip                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'cta';

const badgeTone: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  info: { box: 'bg-primary-50 text-primary', dot: 'bg-accent' },
  success: { box: 'bg-success/10 text-green-800', dot: 'bg-success' },
  warning: { box: 'bg-warning/15 text-amber-800', dot: 'bg-warning' },
  danger: { box: 'bg-danger/10 text-red-800', dot: 'bg-danger' },
  cta: { box: 'bg-cta/20 text-amber-900', dot: 'bg-cta' },
};

export const severityTone: Record<Severity, BadgeTone> = {
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = badgeTone[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        t.box,
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden /> : null}
      {children}
    </span>
  );
}

const avatarPalette = [
  'bg-primary-50 text-primary',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-violet-50 text-violet-700',
  'bg-rose-50 text-rose-700',
  'bg-cyan-50 text-cyan-700',
];

const avatarSize = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' } as const;

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string;
  size?: keyof typeof avatarSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const hash = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-white',
        avatarSize[size],
        avatarPalette[hash % avatarPalette.length],
        className,
      )}
    >
      {initials}
      {/* Drawn over the initials: a transparent "no photo" image (Gravatar d=blank) leaves them visible. */}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function Tooltip({
  content,
  side = 'top',
  children,
}: {
  content: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Overlays: Modal and Drawer                                          */
/* ------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const noopSubscribe = (): (() => void) => () => undefined;

/** Renders into document.body once on the client. */
function Portal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return isClient ? createPortal(children, document.body) : null;
}

/** Scroll lock, Escape to close, focus trap and focus restore while an overlay is open. */
function useOverlay(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, panelRef]);
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const modalWidth = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: OverlayProps & { size?: keyof typeof modalWidth }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlay(open, onClose, panelRef);

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={cn(
                'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-pop outline-none sm:rounded-2xl',
                modalWidth[size],
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-semibold">
                    {title}
                  </h2>
                  {description ? (
                    <p id={descId} className="mt-1 text-sm text-muted">
                      {description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="rounded-lg p-1.5 text-muted transition hover:bg-soft hover:text-ink focus-ring"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">{children}</div>
              {footer ? (
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-soft/60 px-6 py-4 sm:rounded-b-2xl">
                  {footer}
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}

const drawerWidth = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' } as const;

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 'md',
}: OverlayProps & { side?: 'left' | 'right'; width?: keyof typeof drawerWidth }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  const offset = side === 'right' ? 48 : -48;

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
            <motion.aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ x: offset, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: offset, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className={cn(
                'absolute inset-y-0 flex w-full flex-col bg-surface shadow-pop outline-none',
                side === 'right' ? 'right-0' : 'left-0',
                drawerWidth[width],
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-lg font-semibold">
                    {title}
                  </h2>
                  {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="rounded-lg p-1.5 text-muted transition hover:bg-soft hover:text-ink focus-ring"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
              {footer ? (
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-soft/60 px-6 py-4">
                  {footer}
                </div>
              ) : null}
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  content?: ReactNode;
}

export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  variant = 'underline',
  className,
}: {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}) {
  const baseId = useId();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id ?? '');
  const active = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const enabled = items.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);
    const pos = enabled.findIndex(({ t }) => t.id === active);
    let next = pos;
    if (e.key === 'ArrowRight') next = (pos + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (pos - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    select(target.t.id);
    refs.current[target.i]?.focus();
  };

  const current = items.find((t) => t.id === active);

  return (
    <div className={className}>
      <div
        role="tablist"
        onKeyDown={onKeyDown}
        className={cn(
          'flex gap-1 overflow-x-auto',
          variant === 'underline' ? 'border-b border-border' : 'w-fit rounded-xl bg-primary-50/70 p-1',
        )}
      >
        {items.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(node) => {
                refs.current[i] = node;
              }}
              id={`${baseId}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => select(t.id)}
              className={cn(
                'inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold transition focus-ring disabled:opacity-50',
                variant === 'underline'
                  ? cn(
                      '-mb-px border-b-2 px-4 py-3',
                      selected ? 'border-primary-600 text-primary' : 'border-transparent text-muted hover:text-ink',
                    )
                  : cn(
                      'rounded-lg px-3.5 py-2',
                      selected ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-ink',
                    ),
              )}
            >
              {t.icon}
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </div>
      {current?.content !== undefined ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${current.id}`}
          aria-labelledby={`${baseId}-tab-${current.id}`}
          tabIndex={0}
          className="pt-5 focus-ring"
        >
          {current.content}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton, EmptyState, ErrorState                                    */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Please check your connection and try again.',
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {onRetry ? (
        <Button className="mt-5" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper and ProgressBar                                             */
/* ------------------------------------------------------------------ */

export interface StepItem {
  id: string;
  label: string;
  description?: string;
}

export function Stepper({
  steps,
  current,
  onStepClick,
  className,
}: {
  steps: StepItem[];
  /** Zero-based index of the active step. */
  current: number;
  /** When provided, completed steps become clickable. */
  onStepClick?: (index: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn('flex w-full items-start', className)} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done && onStepClick !== undefined;
        const bubble = (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition',
              done && 'border-primary-600 bg-primary-600 text-white',
              active && 'border-primary-600 bg-surface text-primary ring-4 ring-primary-600/15',
              !done && !active && 'border-border bg-surface text-muted',
            )}
          >
            {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : i + 1}
          </span>
        );
        return (
          <li
            key={s.id}
            aria-current={active ? 'step' : undefined}
            className={cn('flex items-start', i < steps.length - 1 && 'flex-1')}
          >
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  aria-label={`Go back to ${s.label}`}
                  className="rounded-full focus-ring"
                >
                  {bubble}
                </button>
              ) : (
                bubble
              )}
              <span className={cn('text-center sm:text-left', !active && 'hidden sm:block')}>
                <span className={cn('block text-sm font-semibold', active ? 'text-ink' : 'text-muted')}>
                  {s.label}
                </span>
                {s.description ? (
                  <span className="hidden text-xs text-muted lg:block">{s.description}</span>
                ) : null}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn('mx-3 mt-[18px] h-0.5 flex-1 rounded-full', done ? 'bg-primary-600' : 'bg-border')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const progressTone = {
  primary: 'bg-primary-600',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export function ProgressBar({
  value,
  tone = 'primary',
  label,
  showValue = false,
  className,
}: {
  value: number;
  tone?: keyof typeof progressTone;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={className}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
          <span>{label}</span>
          {showValue ? <span className="tabular-nums text-ink">{pct}%</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label ?? 'Progress'}
        className="h-2 overflow-hidden rounded-full bg-primary-50"
      >
        <motion.div
          className={cn('h-full rounded-full', progressTone[tone])}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 26 }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination and DataTable                                            */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const start = Math.max(0, Math.min(page - 2, pageCount - 5));
  const numbers = Array.from({ length: Math.min(5, pageCount) }, (_, i) => start + i);

  const navBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm font-medium text-ink transition hover:border-accent hover:text-primary focus-ring disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-muted" aria-live="polite">
        Showing <span className="font-semibold text-ink tabular-nums">{from}</span> to{' '}
        <span className="font-semibold text-ink tabular-nums">{to}</span> of{' '}
        <span className="font-semibold text-ink tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={navBtn} onClick={() => onPageChange(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            aria-label={`Page ${n + 1}`}
            aria-current={n === page ? 'page' : undefined}
            className={cn(navBtn, 'tabular-nums', n === page && 'border-primary-600 bg-primary-600 text-white hover:text-white')}
          >
            {n + 1}
          </button>
        ))}
        <button
          type="button"
          className={navBtn}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount - 1}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' };

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  loading?: boolean;
  empty?: ReactNode;
  initialSort?: SortState;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  /** Rendered above the table, for search boxes, filters and bulk actions. */
  toolbar?: ReactNode;
}

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  pageSize = 8,
  loading = false,
  empty,
  initialSort,
  onRowClick,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  toolbar,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  const [innerSelected, setInnerSelected] = useState<Set<string>>(() => new Set());
  const selected = selectedKeys ?? innerSelected;

  const updateSelection = (next: Set<string>) => {
    if (!selectedKeys) setInnerSelected(next);
    onSelectionChange?.(next);
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = columns.find((c) => c.key === sort.key)?.sortValue;
    if (!get) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [rows, columns, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const visibleKeys = visible.map(rowKey);
  const selectedOnPage = visibleKeys.filter((k) => selected.has(k)).length;
  const allOnPage = visibleKeys.length > 0 && selectedOnPage === visibleKeys.length;

  const togglePage = () => {
    const next = new Set(selected);
    for (const k of visibleKeys) {
      if (allOnPage) next.delete(k);
      else next.add(k);
    }
    updateSelection(next);
  };

  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateSelection(next);
  };

  const colSpan = columns.length + (selectable ? 1 : 0);
  const skeletonRows = Math.min(pageSize, 6);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-card">
      {toolbar ? <div className="border-b border-border p-4">{toolbar}</div> : null}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-soft/80">
            <tr>
              {selectable ? (
                <th scope="col" className="w-12 px-4 py-3">
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allOnPage}
                    indeterminate={!allOnPage && selectedOnPage > 0}
                    onChange={togglePage}
                    disabled={loading || visible.length === 0}
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const isSorted = sort?.key === c.key;
                const SortIcon = isSorted ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted',
                      alignClass[c.align ?? 'left'],
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md uppercase transition hover:text-primary focus-ring',
                          isSorted && 'text-primary',
                        )}
                      >
                        {c.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: skeletonRows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: colSpan }, (_, c) => (
                    <td key={c} className="px-4 py-4">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  {empty ?? (
                    <EmptyState title="Nothing to show yet" description="Records will appear here as soon as they are available." />
                  )}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr
                    key={key}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selectable ? isSelected : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                          }
                        : undefined
                    }
                    className={cn(
                      'transition-colors hover:bg-primary-50/50',
                      onRowClick && 'cursor-pointer focus-ring',
                      isSelected && 'bg-primary-50/70',
                    )}
                  >
                    {selectable ? (
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label="Select row"
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                        />
                      </td>
                    ) : null}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3.5 align-middle text-ink', alignClass[c.align ?? 'left'], c.className)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && sorted.length > 0 ? (
        <div className="border-t border-border">
          <Pagination page={safePage} pageSize={pageSize} total={sorted.length} onPageChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: string;
  tone: ToastTone;
}

export interface ToastApi {
  toast: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const toastStyle: Record<ToastTone, { icon: LucideIcon; bar: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bar: 'bg-success', iconColor: 'text-success' },
  error: { icon: XCircle, bar: 'bg-danger', iconColor: 'text-danger' },
  info: { icon: Info, bar: 'bg-accent', iconColor: 'text-accent' },
  warning: { icon: AlertTriangle, bar: 'bg-warning', iconColor: 'text-warning' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput): string => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const tone = input.tone ?? 'info';
      setItems((prev) => [...prev.slice(-3), { ...input, id, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), input.durationMs ?? (tone === 'error' ? 7000 : 4500)),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (title, description) => push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error' }),
      info: (title, description) => push({ title, description, tone: 'info' }),
      warning: (title, description) => push({ title, description, tone: 'warning' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-3 p-4 sm:items-end sm:p-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const s = toastStyle[t.tone];
            const Icon = s.icon;
            return (
              <motion.div
                key={t.id}
                layout
                role={t.tone === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface py-3.5 pl-5 pr-3 shadow-pop"
              >
                <span className={cn('absolute inset-y-0 left-0 w-1.5', s.bar)} aria-hidden />
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.iconColor)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  {t.description ? <p className="mt-0.5 text-sm text-muted">{t.description}</p> : null}
                  {t.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2 rounded text-sm font-semibold text-primary-600 hover:underline focus-ring"
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="rounded-md p-1 text-muted transition hover:bg-soft hover:text-ink focus-ring"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}
