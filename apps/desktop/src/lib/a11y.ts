import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { Target, Transition } from 'framer-motion';

/* ───────────────────────── Shared class helpers ───────────────────────── */

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white';

/* ───────────────────────── Reduced motion ───────────────────────── */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches;
}

function subscribeReduced(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** Live value of the OS-level "reduce motion" setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

export interface MotionPreset {
  initial: Target;
  animate: Target;
  exit: Target;
  transition: Transition;
}

/** Fade + small slide; collapses to a near-instant fade when motion is reduced. */
export function fadeSlide(reduced: boolean, axis: 'x' | 'y' = 'y', distance = 12): MotionPreset {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.01 },
    };
  }
  return {
    initial: { opacity: 0, [axis]: distance },
    animate: { opacity: 1, [axis]: 0 },
    exit: { opacity: 0, [axis]: distance },
    transition: { duration: 0.2, ease: 'easeOut' },
  };
}

/* ───────────────────────── Focus trap ───────────────────────── */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  );
}

export interface FocusTrapOptions {
  /** Called when Escape is pressed. Omit to make the trap non-dismissible. */
  onEscape?: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Return focus to the previously focused element on release. Default true. */
  restoreFocus?: boolean;
}

// Only the most recently activated trap reacts, so a Lockdown overlay can sit above a drawer.
const trapStack: symbol[] = [];

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: FocusTrapOptions = {},
): void {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const token = Symbol('focus-trap');
    trapStack.push(token);
    const isTop = (): boolean => trapStack[trapStack.length - 1] === token;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    const start = optionsRef.current.initialFocus?.current ?? getFocusable(root)[0] ?? root;
    start.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        const handler = optionsRef.current.onEscape;
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        root.focus();
        return;
      }
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (e: FocusEvent): void => {
      if (!isTop()) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        (getFocusable(root)[0] ?? root).focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      const index = trapStack.indexOf(token);
      if (index >= 0) trapStack.splice(index, 1);
      if (optionsRef.current.restoreFocus !== false && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [active, ref]);
}

/* ───────────────────────── Keyboard shortcut registry ───────────────────────── */

export interface ShortcutDef {
  /** Unique id. Re-registering the same id replaces the earlier handler. */
  id: string;
  /** e.g. "mod+k", "shift+?", "esc", "alt+h". "mod" = Ctrl on Windows/Linux, Cmd on macOS. */
  combo: string;
  description: string;
  group?: string;
  /** Fire even while a text field has focus. Combos using "mod" always do. */
  allowInInput?: boolean;
  enabled?: boolean;
  handler: (e: KeyboardEvent) => void;
}

interface ParsedCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

interface RegistryEntry {
  def: ShortcutDef;
  parsed: ParsedCombo;
  seq: number;
}

const registry = new Map<string, RegistryEntry>();
const registryListeners = new Set<() => void>();
let registrySeq = 0;
let snapshot: ShortcutDef[] = [];

function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const raw = parts[parts.length - 1] ?? '';
  const key = raw === 'esc' ? 'escape' : raw === 'space' ? ' ' : raw;
  return {
    key,
    mod: parts.includes('mod') || parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

function matches(e: KeyboardEvent, p: ParsedCombo): boolean {
  if (e.key.toLowerCase() !== p.key) return false;
  if ((e.ctrlKey || e.metaKey) !== p.mod) return false;
  if (e.altKey !== p.alt) return false;
  const isSymbol = p.key.length === 1 && !/[a-z0-9]/.test(p.key);
  return isSymbol || e.shiftKey === p.shift;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function onGlobalKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return;
  const ordered = [...registry.values()].sort((a, b) => b.seq - a.seq);
  for (const { def, parsed } of ordered) {
    if (def.enabled === false || !matches(e, parsed)) continue;
    if (isEditable(e.target) && !parsed.mod && !def.allowInInput) continue;
    e.preventDefault();
    def.handler(e);
    return;
  }
}

function publishRegistry(): void {
  snapshot = [...registry.values()]
    .map((entry) => entry.def)
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.description.localeCompare(b.description));
  registryListeners.forEach((listener) => listener());
}

/** Registers a shortcut. The most recently registered match wins. Returns an unregister function. */
export function registerShortcut(def: ShortcutDef): () => void {
  const entry: RegistryEntry = { def, parsed: parseCombo(def.combo), seq: ++registrySeq };
  if (registry.size === 0) window.addEventListener('keydown', onGlobalKeyDown);
  registry.set(def.id, entry);
  publishRegistry();
  return () => {
    if (registry.get(def.id) !== entry) return;
    registry.delete(def.id);
    if (registry.size === 0) window.removeEventListener('keydown', onGlobalKeyDown);
    publishRegistry();
  };
}

export function useShortcut(def: ShortcutDef): void {
  const handlerRef = useRef(def.handler);
  useEffect(() => {
    handlerRef.current = def.handler;
  });
  const { id, combo, description, group, allowInInput, enabled } = def;
  useEffect(
    () =>
      registerShortcut({
        id,
        combo,
        description,
        group,
        allowInInput,
        enabled,
        handler: (e) => handlerRef.current(e),
      }),
    [id, combo, description, group, allowInInput, enabled],
  );
}

/** All currently registered shortcuts, e.g. for a "Keyboard shortcuts" list. */
export function useShortcutList(): ShortcutDef[] {
  return useSyncExternalStore(
    (listener) => {
      registryListeners.add(listener);
      return () => registryListeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
}

/** Human readable combo: "mod+shift+k" becomes "Ctrl+Shift+K" or "⌘⇧K". */
export function formatCombo(combo: string): string {
  const mac = isMac();
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  return parts
    .map((p) => {
      if (p === 'mod' || p === 'ctrl') return mac ? '⌘' : 'Ctrl';
      if (p === 'shift') return mac ? '⇧' : 'Shift';
      if (p === 'alt') return mac ? '⌥' : 'Alt';
      if (p === 'esc' || p === 'escape') return 'Esc';
      if (p === 'space') return 'Space';
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(mac ? '' : '+');
}

/* ───────────────────────── Screen reader announcements ───────────────────────── */

type Politeness = 'polite' | 'assertive';
let liveRegions: Record<Politeness, HTMLElement> | null = null;

function ensureLiveRegions(): Record<Politeness, HTMLElement> {
  if (liveRegions && liveRegions.polite.isConnected) return liveRegions;
  const make = (politeness: Politeness): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    el.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    document.body.appendChild(el);
    return el;
  };
  liveRegions = { polite: make('polite'), assertive: make('assertive') };
  return liveRegions;
}

/** Speaks a message through a visually hidden live region. */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  if (typeof document === 'undefined') return;
  const region = ensureLiveRegions()[politeness];
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}
