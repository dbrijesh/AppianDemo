import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  roles: string[]
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  clearAuth: () => void
  hasRole: (...roles: string[]) => boolean
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      hasRole: (...roles) => {
        const userRoles = get().user?.roles ?? []
        return roles.some(r => userRoles.includes(r))
      },
      isAdmin: () => get().user?.roles.includes('admin') ?? false,
    }),
    { name: 'mgp-auth' }
  )
)
