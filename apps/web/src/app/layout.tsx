import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/ui/primitives';
import DevToolbar from '../components/dev/DevToolbar';
import '../styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Smart Proctor | Secure online MCQ exams by Where U Elevate',
    template: '%s | Smart Proctor',
  },
  description:
    'A secure exam browser with AI-assisted proctoring, live mentor monitoring and instant reports. Run fair, cheat-resistant online MCQ assessments at scale.',
  applicationName: 'Smart Proctor',
  keywords: [
    'online proctoring',
    'secure exam browser',
    'MCQ assessment platform',
    'AI proctoring',
    'Where U Elevate',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Smart Proctor',
    title: 'Smart Proctor | Secure online MCQ exams',
    description:
      'Lock down the exam environment, monitor candidates live and review every violation with evidence.',
    images: [{ url: '/images/logo.png', alt: 'Where U Elevate Smart Proctor' }],
  },
  icons: { icon: '/images/logo.png' },
};

export const viewport: Viewport = {
  themeColor: '#0A4DA6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-dvh bg-soft font-sans text-ink antialiased">
        <a
          href="#main-content"
          className="sr-only rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:outline-2 focus:outline-offset-2 focus:outline-cta"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <main id="main-content" tabIndex={-1} className="outline-none">
            {children}
          </main>
        </ToastProvider>
        {process.env.NODE_ENV !== 'production' && <DevToolbar />}
      </body>
    </html>
  );
 }
