'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Instagram, Linkedin, Mail, Twitter, Youtube, type LucideIcon } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, useToast } from '@/components/ui/primitives';
import { BrandMark } from '@/components/layout/BrandMark';

const emailSchema = z.string().trim().min(1, 'Please enter your email').email('Enter a valid email address');

interface FooterColumn {
  title: string;
  links: { href: string; label: string }[];
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/security', label: 'Security and privacy' },
      { href: '/download', label: 'Download the app' },
      { href: '/download#requirements', label: 'System requirements' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About Where U Elevate' },
      { href: '/contact', label: 'Contact us' },
      { href: '/for-organizations', label: 'For organizations' },
      { href: '/careers', label: 'Careers' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/help/candidates', label: 'Candidate guide' },
      { href: '/help/mentors', label: 'Mentor handbook' },
      { href: '/faq', label: 'FAQs' },
      { href: '/status', label: 'System status' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of use' },
      { href: '/privacy#proctoring-consent', label: 'Proctoring consent' },
      { href: '/privacy#retention', label: 'Data retention' },
    ],
  },
];

const SOCIALS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com', icon: Linkedin },
  { label: 'X (Twitter)', href: 'https://x.com', icon: Twitter },
  { label: 'Instagram', href: 'https://www.instagram.com', icon: Instagram },
  { label: 'YouTube', href: 'https://www.youtube.com', icon: Youtube },
];

/** Mock subscribe call; replaced by lib/api.ts once the API exists. */
function subscribeMock(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (email.toLowerCase().endsWith('@fail.test')) reject(new Error('Subscription service is unavailable.'));
      else resolve();
    }, 700);
  });
}

function Newsletter() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await subscribeMock(parsed.data);
      toast.success('You are subscribed', 'Product updates and exam-readiness tips will reach your inbox.');
      setEmail('');
    } catch (err) {
      toast.error('Could not subscribe', err instanceof Error ? err.message : 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
      <Input
        type="email"
        name="newsletter-email"
        autoComplete="email"
        aria-label="Email address for newsletter"
        placeholder="you@college.edu.in"
        leftIcon={<Mail />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        wrapperClassName="flex-1"
      />
      <Button type="submit" variant="cta" loading={loading} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
        Subscribe
      </Button>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <BrandMark />
            <p className="mt-5 max-w-md text-sm leading-6 text-muted">
              Secure, fair and transparent online assessments. Smart Proctor combines a locked-down exam browser with AI
              monitoring and human mentors, so every result can be trusted.
            </p>
            <h2 className="mt-8 text-sm font-semibold text-ink">Get product updates</h2>
            <p className="mt-1 text-sm text-muted">One short email a month. Unsubscribe any time.</p>
            <Newsletter />
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="rounded text-sm text-muted transition hover:text-primary-600 focus-ring"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-5 border-t border-border pt-8 md:flex-row md:items-center">
          <div className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:gap-5">
            <p>&copy; {new Date().getFullYear()} Where U Elevate. All rights reserved.</p>
            <p className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" aria-hidden />
              All systems operational
            </p>
          </div>
          <ul className="flex items-center gap-2" aria-label="Social media">
            {SOCIALS.map(({ label, href, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted transition hover:border-accent hover:bg-primary-50 hover:text-primary focus-ring"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
