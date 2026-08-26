'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StoredRole = string | { role?: { name?: string }; name?: string };

export function normalizeRole(role: StoredRole): string {
  if (typeof role === 'string') return role;
  return role?.role?.name ?? role?.name ?? '';
}

export function normalizeRoles(roles: StoredRole[] = []): string[] {
  return roles.map(normalizeRole).filter(Boolean);
}

export interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { id: string; name: string } | null;
    designation?: { id: string; title: string } | null;
    managerId?: string | null;
  } | null;
}

interface AuthState {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  hasRole: (...roles: string[]) => boolean;
  primaryRole: () => string;
  hydrated: boolean;
  markHydrated: () => void;
}

const ROLE_PRIORITY = ['SUPER_ADMIN', 'HR_ADMIN', 'LEADERSHIP', 'MANAGER', 'EMPLOYEE'];

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user: user ? { ...user, roles: normalizeRoles(user.roles as StoredRole[]) } : null }),
      hasRole: (...roles) => {
        const userRoles = normalizeRoles((get().user?.roles ?? []) as StoredRole[]);
        return roles.some((r) => userRoles.includes(r));
      },
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      primaryRole: () => {
        const userRoles = normalizeRoles((get().user?.roles ?? []) as StoredRole[]);
        return ROLE_PRIORITY.find((r) => userRoles.includes(r)) ?? 'EMPLOYEE';
      },
    }),
    { name: 'hrms-session', skipHydration: true },
  ),
);
