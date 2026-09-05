import { canRegulariseWorkDay } from "./regularisation.rules";

/**
 * The Fix button in the UI and the POST /attendance/regularise guard both read
 * this rule, so these cases pin down exactly when "Fix" is offered.
 */
describe("canRegulariseWorkDay", () => {
  const day = (overrides: any = {}) => ({
    attendanceStatus: "PRESENT",
    isLate: false,
    checkInAt: new Date("2026-09-01T03:30:00Z"),
    checkOutAt: new Date("2026-09-01T12:30:00Z"),
    ...overrides,
  });

  it("does NOT offer Fix on a clean Present day", () => {
    expect(canRegulariseWorkDay(day())).toBe(false);
  });

  it("does NOT offer Fix on a Work From Home day", () => {
    expect(
      canRegulariseWorkDay(day({ attendanceStatus: "WORK_FROM_HOME" })),
    ).toBe(false);
  });

  it("offers Fix on an Absent day (missing check-in)", () => {
    expect(
      canRegulariseWorkDay(
        day({ attendanceStatus: "ABSENT", checkInAt: null, checkOutAt: null }),
      ),
    ).toBe(true);
  });

  it("offers Fix on a Late day", () => {
    expect(
      canRegulariseWorkDay(day({ attendanceStatus: "LATE", isLate: true })),
    ).toBe(true);
  });

  it("offers Fix on a Half Day", () => {
    expect(canRegulariseWorkDay(day({ attendanceStatus: "HALF_DAY" }))).toBe(
      true,
    );
  });

  it("offers Fix when the employee checked in but never checked out", () => {
    expect(canRegulariseWorkDay(day({ checkOutAt: null }))).toBe(true);
  });

  it("never offers Fix on weekends, holidays or approved leave", () => {
    for (const status of ["WEEKEND", "HOLIDAY", "ON_LEAVE"]) {
      expect(
        canRegulariseWorkDay(
          day({ attendanceStatus: status, checkInAt: null, checkOutAt: null }),
        ),
      ).toBe(false);
    }
  });

  it("still offers Fix when the status reads Present but the late flag was never cleared", () => {
    // This is the exact inconsistency the approval fix removes: an approved
    // regularisation used to set PRESENT while leaving isLate = true.
    expect(
      canRegulariseWorkDay(day({ attendanceStatus: "PRESENT", isLate: true })),
    ).toBe(true);
  });
});
