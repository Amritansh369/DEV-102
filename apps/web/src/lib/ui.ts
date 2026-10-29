import { useSyncExternalStore } from 'react';

/** Joins class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'cta' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const buttonBase =
  'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl font-semibold transition focus-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-60';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white shadow-btn hover:bg-primary',
  cta: 'bg-cta text-ink shadow-btn hover:brightness-95',
  ghost: 'bg-transparent text-primary hover:bg-primary-50',
  outline:
    'border border-border bg-surface text-ink hover:border-accent hover:text-primary',
  danger: 'bg-danger text-white shadow-btn hover:brightness-95',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3.5 text-sm',
  md: 'h-11 gap-2 px-5 text-sm',
  lg: 'h-12 gap-2.5 px-7 text-base',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class string for buttons; also usable on <Link> and <a> so anchors look like buttons. */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    buttonBase,
    buttonVariants[variant],
    buttonSizes[size],
    fullWidth && 'w-full',
    className,
  );
}

const subscribeNoop = (): (() => void) => () => undefined;

/** True after hydration. Use it to avoid server/client mismatches for persisted client state. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}
