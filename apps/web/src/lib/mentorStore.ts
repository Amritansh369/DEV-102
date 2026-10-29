"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Violation } from "@/lib/types";
import type { FinalDecision, ReviewRecord } from "@/lib/api";
import type { Verdict } from "@/components/mentor/meta";

export type ToastTone = "success" | "error" | "info";
export interface Toast { id: string; tone: ToastTone; title: string; description?: string }

interface MentorState {
  reviews: Record<string, ReviewRecord>;
  decisions: Record<string, FinalDecision>;
  toasts: Toast[];
  saveReview: (record: ReviewRecord) => void;
  saveDecision: (decision: FinalDecision) => void;
  toast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;

export const useMentorStore = create<MentorState>()(
  persist(
    (set, get) => ({
      reviews: {},
      decisions: {},
      toasts: [],
      saveReview: (record) => set((s) => ({ reviews: { ...s.reviews, [record.violationId]: record } })),
      saveDecision: (decision) => set((s) => ({ decisions: { ...s.decisions, [decision.sessionId]: decision } })),
      toast: (toast) => {
        toastCounter += 1;
        const id = `toast-${toastCounter}`;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
        setTimeout(() => get().dismissToast(id), 4800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "dev102-mentor-reviews",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ reviews: s.reviews, decisions: s.decisions }),
    },
  ),
);

/** A mentor's saved review wins over whatever the server copy says. */
export function effectiveVerdict(violation: Violation, reviews: Record<string, ReviewRecord>): Verdict | undefined {
  return reviews[violation.id]?.verdict ?? violation.reviewed;
}
