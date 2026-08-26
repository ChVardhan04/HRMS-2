import { CalendarService } from "./calendar.service";

describe("CalendarService business rules", () => {
  const prisma: any = {
    organization: { findFirst: jest.fn() },
    holiday: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const service = new CalendarService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findFirst.mockResolvedValue({
      id: "org-1",
      timezone: "Asia/Kolkata",
      officeStartMinutes: 570,
      officeEndMinutes: 1140,
      lunchStartMinutes: 810,
      lunchEndMinutes: 840,
      lateGraceMinutes: 0,
      attendanceCallStartMinutes: 555,
      attendanceCallEndMinutes: 570,
      attendanceAbsenceCutoffMinutes: 720,
      dprSlaMinutes: 1320,
      dprReminder1Minutes: 1080,
      dprReminder2Minutes: 1200,
      saturdayWorkPattern: "FIRST_THIRD_WORKING",
    });
    prisma.holiday.findFirst.mockResolvedValue(null);
  });

  it("marks first and third Saturdays working and second/fourth off", async () => {
    const first = await service.isWorkingDay(
      new Date("2026-08-01T00:00:00.000Z"),
    );
    const second = await service.isWorkingDay(
      new Date("2026-08-08T00:00:00.000Z"),
    );
    expect(first.working).toBe(true);
    expect(second.working).toBe(false);
  });

  it("lets company holidays override the weekly working pattern", async () => {
    prisma.holiday.findFirst.mockResolvedValue({
      id: "holiday-1",
      name: "Holiday",
    });
    const result = await service.isWorkingDay(
      new Date("2026-08-03T00:00:00.000Z"),
    );
    expect(result.working).toBe(false);
    expect(result.type).toBe("HOLIDAY");
  });
});
