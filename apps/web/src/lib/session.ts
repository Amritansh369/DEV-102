'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getToken, setToken } from './http'
import type { Role } from './types'

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface SessionState {
  user: SessionUser | null;
  setUser: (user: SessionUser) => void;
  logout: () => void;
}

/** Client-side session. The login screen calls setUser with the result of lib/api.ts. */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => {
        setToken(null)
        set({ user: null })
      },
    }),
    { name: 'dev102.session' },
  ),
);

/** Where each role lands after signing in. */
export const homeFor = (role: Role): string => (role === 'ADMIN' ? '/organization' : role === 'MENTOR' ? '/proctor' : '/lobby')

/** Client-side route guard. The API enforces roles on every request; this only avoids showing a page the user cannot use. */
export function useRequireRole(roles: Role[]): void {
  const router = useRouter()
  const key = roles.join(',')
  useEffect(() => {
    const user = useSession.getState().user
    if (!user || !getToken() || !key.split(',').includes(user.role)) {
      const role = key.includes('ADMIN') && !key.includes('MENTOR') ? 'admin' : key.includes('MENTOR') ? 'mentor' : 'candidate'
      router.replace(`/login?role=${role}&next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [key, router])
}
