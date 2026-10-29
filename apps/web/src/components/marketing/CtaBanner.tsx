"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

interface CtaAction {
  label: string;
  href: string;
}

interface CtaBannerProps {
  title: string;
  description: string;
  primary: CtaAction;
  secondary?: CtaAction;
}

export function CtaBanner({ title, description, primary, secondary }: CtaBannerProps) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="cta-title" className="px-4 py-16 sm:px-6">
      <motion.div
        // The server can't know the motion preference, so `initial` stays fixed (no hydration mismatch); reduced motion just skips the transition.
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-600 to-accent px-6 py-14 text-center shadow-[0_20px_50px_-12px_rgba(10,77,166,0.45)] sm:px-12"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto max-w-2xl">
          <h2 id="cta-title" className="font-heading text-3xl font-semibold text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-base text-blue-100 sm:text-lg">{description}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primary.href}
              className="group inline-flex items-center gap-2 rounded-xl bg-cta px-6 py-3 font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
            >
              {primary.label}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden />
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex items-center rounded-xl border border-white/40 px-6 py-3 font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
