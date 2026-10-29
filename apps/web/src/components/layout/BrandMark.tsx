'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/ui';

/** Logo from /images/logo.png with a CSS fallback when the file is missing. */
export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href="/"
      aria-label="Where U Elevate Smart Proctor, home"
      className={cn('inline-flex items-center gap-2.5 rounded-lg focus-ring', className)}
    >
      {failed ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-btn">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
      ) : (
        // The logo is blue on transparent, so it sits on a white badge to stay visible on blue backgrounds.
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" className="h-9 w-9 object-contain" onError={() => setFailed(true)} />
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span className={cn('font-heading text-base font-semibold', light ? 'text-white' : 'text-primary')}>
          Smart Proctor
        </span>
        <span className={cn('text-[11px] font-medium', light ? 'text-white/70' : 'text-muted')}>
          by Where U Elevate
        </span>
      </span>
    </Link>
  );
}
