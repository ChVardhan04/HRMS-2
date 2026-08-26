export const SCHEDULED_JOBS_QUEUE = "scheduled-jobs";

export enum JobName {
  SEND_NOTIFICATION = "send-notification",
  DPR_REMINDER_SWEEP = "dpr-reminder-sweep",
  DPR_ESCALATION_SWEEP = "dpr-escalation-sweep",
  STALE_CANDIDATE_SWEEP = "stale-candidate-sweep",
  GROUP_CHECK_REMINDER_SWEEP = "group-check-reminder-sweep",
  KRA_PRECALC = "kra-precalculation",
  KRA_FINALIZE = "kra-finalization",
  LEAVE_ACCRUAL = "leave-accrual",
  STRIKE_EVALUATION = "strike-evaluation",
  AUTO_ABSENT_SWEEP = "auto-absent-sweep",
}
