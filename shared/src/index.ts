// Shared TypeScript types/enums used by both the NestJS backend and the Next.js frontend.
// Kept intentionally small and dependency-free (no Prisma imports) so the frontend can consume
// it without pulling in server-only packages.

export const ROLE_NAMES = [
  'EMPLOYEE',
  'MANAGER',
  'HR_ADMIN',
  'HIRING_MANAGER',
  'FINANCE',
  'LEADERSHIP',
  'SUPER_ADMIN',
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const DPR_STATUSES = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
export type DprStatus = (typeof DPR_STATUSES)[number];

export const CANDIDATE_STAGES = [
  'SOURCED',
  'APPLIED',
  'RESUME_SCREEN',
  'HR_SCREEN',
  'TECHNICAL_ROUND',
  'MANAGER_ROUND',
  'OFFER',
  'JOINED',
  'REJECTED',
  'WITHDRAWN',
  'ON_HOLD',
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export interface KraBreakdownItem {
  weight: number;
  achievementPercent: number;
  contribution: number;
  isAutomated: boolean;
}

export const KRA_DEFAULT_WEIGHTS = {
  DPR_SUBMISSION: 20,
  TASK_COMPLETION: 30,
  ATTENDANCE: 20,
  DPR_QUALITY: 15,
  COLLABORATION: 15,
} as const;

export const STRIKE_CONFIG = {
  thresholdScore: 80,
  rollingWindowMonths: 6,
  strikesToEscalate: 3,
} as const;
