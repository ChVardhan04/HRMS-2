import { AttendanceStatus } from "@prisma/client";

export interface RegularisableWorkDay {
  attendanceStatus: AttendanceStatus | string;
  isLate?: boolean | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}

/**
 * SINGLE SOURCE OF TRUTH for whether the "Fix" (regularisation) action applies
 * to a WorkDay.
 *
 * This lives in its own dependency-free module so that both AttendanceService
 * (which enforces it on write) and WorkdayService (which surfaces it to the UI
 * as `canRegularise`) can use it without creating a circular import between
 * the two services.
 *
 * Regularisation exists to fix a genuine attendance problem:
 *   - ABSENT   : no check-in was recorded at all (missing check-in)
 *   - LATE     : checked in after the department's late threshold
 *   - HALF_DAY : short day, by arrival time or by hours worked
 *   - an orphan check-in with no matching check-out (forgot to check out)
 *
 * It deliberately does NOT apply to:
 *   - a clean PRESENT day, or a WORK_FROM_HOME day, which are already correct
 *   - WEEKEND / HOLIDAY / ON_LEAVE days, which are not attendance faults and
 *     are corrected through the calendar or leave modules instead
 *
 * `isLate` is consulted in addition to the status because an approved
 * regularisation resets the status to PRESENT. If the late flags were not also
 * cleared, a row displaying as PRESENT would keep offering the Fix button —
 * which is exactly the inconsistency this rule is designed to prevent.
 */
export function canRegulariseWorkDay(workDay: RegularisableWorkDay): boolean {
  const status = workDay.attendanceStatus;

  if (
    status === AttendanceStatus.WEEKEND ||
    status === AttendanceStatus.HOLIDAY ||
    status === AttendanceStatus.ON_LEAVE
  ) {
    return false;
  }

  if (status === AttendanceStatus.ABSENT) return true;
  if (status === AttendanceStatus.LATE) return true;
  if (status === AttendanceStatus.HALF_DAY) return true;

  // A day still flagged late is unresolved even if its status reads PRESENT.
  if (workDay.isLate) return true;

  // Checked in but never checked out — an incomplete record that needs fixing.
  if (workDay.checkInAt && !workDay.checkOutAt) return true;

  return false;
}
