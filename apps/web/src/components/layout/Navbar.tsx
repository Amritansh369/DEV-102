'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Download,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MonitorPlay,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, Badge, Drawer, useToast } from '@/components/ui/primitives';
import { BrandMark } from '@/components/layout/BrandMark';
import { useSession, type SessionUser } from '@/lib/session';
import { post } from '@/lib/http';
import { buttonStyles, cn, useIsClient } from '@/lib/ui';
import type { Role } from '@/lib/types';

interface NavLink {
  href: string;
  label: string;
  icon?: LucideIcon;
}

const PUBLIC_LINKS: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/security', label: 'Security' },
  { href: '/download', label: 'Download App' },
];

const ROLE_LINKS: Record<Role, NavLink[]> = {
  ADMIN: [
    { href: '/organization', label: 'Organization panel', icon: LayoutDashboard },
    { href: '/organization/exams', label: 'Exams', icon: FileText },
    { href: '/organization/reports', label: 'Reports', icon: BarChart3 },
  ],
  MENTOR: [
    { href: '/proctor', label: 'Live monitor', icon: MonitorPlay },
  ],
  CANDIDATE: [{ href: '/lobby', label: 'Exam lobby', icon: ShieldCheck }],
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Organization',
  MENTOR: 'Proctor',
  CANDIDATE: 'Candidate',
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function UserMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-primary-50 hover:text-primary focus-ring';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-3 transition hover:border-accent focus-ring"
      >
        <Avatar name={user.name} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-semibold xl:block">{user.name}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-2 shadow-pop"
        >
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <Badge tone="info" className="mt-2">
              {ROLE_LABEL[user.role]}
            </Badge>
          </div>
          <div className="my-1 h-px bg-border" />
          {ROLE_LINKS[user.role].map((l) => {
            const Icon = l.icon;
            return (
              <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
                {Icon ? <Icon className="h-4 w-4 text-muted" aria-hidden /> : null}
                {l.label}
              </Link>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={cn(itemClass, 'hover:bg-danger/10 hover:text-danger')}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const isClient = useIsClient();
  const storedUser = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The persisted session only exists in the browser, so wait for hydration before using it.
  const user = isClient ? storedUser : null;
  const roleLinks = user ? ROLE_LINKS[user.role] : [];
  const topLinks: NavLink[] = [...roleLinks.slice(0, 1), ...PUBLIC_LINKS];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => {
    void post('/auth/logout').catch(() => undefined); // reads the token before logout() clears it
    logout();
    setDrawerOpen(false);
    toast.success('Signed out', 'You have been signed out safely.');
    router.push('/login');
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-surface/85 backdrop-blur-md transition-shadow duration-200',
        scrolled ? 'border-border shadow-card' : 'border-transparent',
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 xl:gap-6 px-4 sm:px-6 lg:px-8">
        <BrandMark />

        <ul className="hidden items-center gap-1 lg:flex">
          {topLinks.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold transition focus-ring xl:px-3.5',
                    active ? 'bg-primary-50 text-primary-600' : 'text-ink/75 hover:bg-primary-50/70 hover:text-primary',
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <UserMenu user={user} onLogout={handleLogout} />
          ) : (
            <Link href="/login" className={buttonStyles({ variant: 'ghost' })}>
              <LogIn className="h-4 w-4" aria-hidden />
              Log in
            </Link>
          )}
          <Link href="/download" className={buttonStyles({ variant: 'cta' })}>
            <Download className="h-4 w-4" aria-hidden />
            Get the app
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          className="rounded-xl border border-border p-2.5 text-ink transition hover:border-accent hover:text-primary focus-ring lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </nav>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu" width="sm">
        <div className="flex h-full flex-col gap-6">
          {user ? (
            <div className="flex items-center gap-3 rounded-2xl bg-soft p-4">
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
          ) : null}

          <ul className="flex flex-col gap-1">
            {[...roleLinks, ...PUBLIC_LINKS].map((l) => {
              const active = isActive(pathname, l.href);
              const Icon = l.icon;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setDrawerOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition focus-ring',
                      active ? 'bg-primary-50 text-primary-600' : 'text-ink hover:bg-soft',
                    )}
                  >
                    {Icon ? <Icon className="h-5 w-5 text-muted" aria-hidden /> : null}
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-auto flex flex-col gap-3">
            <Link href="/download" onClick={() => setDrawerOpen(false)} className={buttonStyles({ variant: 'cta', size: 'lg', fullWidth: true })}>
              <Download className="h-5 w-5" aria-hidden />
              Download the app
            </Link>
            {user ? (
              <button type="button" onClick={handleLogout} className={buttonStyles({ variant: 'outline', size: 'lg', fullWidth: true })}>
                <LogOut className="h-5 w-5" aria-hidden />
                Sign out
              </button>
            ) : (
              <Link href="/login" onClick={() => setDrawerOpen(false)} className={buttonStyles({ variant: 'outline', size: 'lg', fullWidth: true })}>
                <LogIn className="h-5 w-5" aria-hidden />
                Log in
              </Link>
            )}
          </div>
        </div>
      </Drawer>
    </header>
  );
}
