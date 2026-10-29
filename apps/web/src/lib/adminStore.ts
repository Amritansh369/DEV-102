'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'
export interface Toast {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface AdminUiState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  toasts: Toast[]
  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
  pushToast: (toast: Omit<Toast, 'id'>, ttlMs?: number) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

/** Call useAdminUi.persist.rehydrate() once on the client (done in the admin layout). */
export const useAdminUi = create<AdminUiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toasts: [],
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
      pushToast: (toast, ttlMs = 4500) => {
        const id = ++toastSeq
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }))
        window.setTimeout(() => get().dismissToast(id), ttlMs)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'dev102-admin-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
      skipHydration: true,
    },
  ),
)

const push = (tone: ToastTone) => (title: string, description?: string) =>
  useAdminUi.getState().pushToast({ tone, title, description })

export const toast = {
  success: push('success'),
  error: push('error'),
  info: push('info'),
  warning: push('warning'),
}
