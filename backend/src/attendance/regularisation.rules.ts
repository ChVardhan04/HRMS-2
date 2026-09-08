import { AttendanceStatus } from "@prisma/client";

export interface RegularisableWorkDay {
  attendanceStatus: AttendanceStatus | string;
  isLate?: boolean | null;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
}


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
