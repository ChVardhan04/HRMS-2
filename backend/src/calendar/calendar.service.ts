import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarSettingsDto, HolidayDto } from "./dto/calendar.dto";
import { SaturdayWorkPattern } from "@prisma/client";

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  async getOrganization() {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) throw new NotFoundException("Organization is not configured");
    return org;
  }

  private dateOnly(value: string | Date) {
    const raw = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
    return new Date(`${raw}T00:00:00.000Z`);
  }

  private dateKey(value: Date) { return value.toISOString().slice(0, 10); }
  private saturdayOccurrence(date: Date) { return Math.floor((date.getUTCDate() - 1) / 7) + 1; }

  private organizationPolicy(org: any) {
    return {
      departmentId: null,
      mondayWorking: true,
      tuesdayWorking: true,
      wednesdayWorking: true,
      thursdayWorking: true,
      fridayWorking: true,
      saturdayWorking: undefined as boolean | undefined,
      sundayWorking: false,
      officeStartMinutes: org.officeStartMinutes,
      officeEndMinutes: org.officeEndMinutes,
      lunchStartMinutes: org.lunchStartMinutes,
      lunchEndMinutes: org.lunchEndMinutes,
      checkInOpenMinutes: org.officeStartMinutes,
      lateAfterMinutes: org.officeStartMinutes + org.lateGraceMinutes,
      halfDayAfterMinutes: Math.max(org.officeStartMinutes + org.lateGraceMinutes, 645),
      checkInCutoffMinutes: org.attendanceAbsenceCutoffMinutes,
      autoAbsentMinutes: org.attendanceAbsenceCutoffMinutes,
      allowedLatesPerMonth: 2,
      firstLatePenaltyDays: 0,
      secondLatePenaltyDays: 0,
      thirdPlusLatePenaltyDays: 1,
      sandwichLeaveEnabled: true,
      sandwichIncludesPreviousWorkingDay: true,
      probationMonthlyLeaveLimit: 1,
      probationMaxDaysPerRequest: 1,
      saturdayWorkPattern: org.saturdayWorkPattern,
      timezone: org.timezone,
    };
  }

  async getDepartmentPolicy(departmentId?: string | null) {
    const org = await this.getOrganization();
    if (!departmentId) return this.organizationPolicy(org);
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
      include: { policy: true },
    });
    if (!department) return this.organizationPolicy(org);
    if (!department.policy) {
      const policy = await this.prisma.departmentPolicy.create({ data: { departmentId } });
      return { ...policy, timezone: org.timezone };
    }
    return { ...department.policy, timezone: org.timezone };
  }

  async getEmployeePolicy(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });
    if (!employee) throw new NotFoundException("Employee not found");
    return this.getDepartmentPolicy(employee.departmentId);
  }

  private workingForWeekday(day: Date, policy: any) {
    const weekday = day.getUTCDay();
    if (weekday === 0) return Boolean(policy.sundayWorking);
    if (weekday === 1) return Boolean(policy.mondayWorking);
    if (weekday === 2) return Boolean(policy.tuesdayWorking);
    if (weekday === 3) return Boolean(policy.wednesdayWorking);
    if (weekday === 4) return Boolean(policy.thursdayWorking);
    if (weekday === 5) return Boolean(policy.fridayWorking);
    if (policy.saturdayWorkPattern) {
      const occurrence = this.saturdayOccurrence(day);
      return policy.saturdayWorkPattern === SaturdayWorkPattern.ALL_SATURDAYS_WORKING ||
        (policy.saturdayWorkPattern === SaturdayWorkPattern.FIRST_THIRD_WORKING && (occurrence === 1 || occurrence === 3)) ||
        (policy.saturdayWorkPattern === SaturdayWorkPattern.SECOND_FOURTH_WORKING && (occurrence === 2 || occurrence === 4));
    }
    return Boolean(policy.saturdayWorking);
  }

  private async resolveWorkingDay(date: Date, policy: any) {
    const org = await this.getOrganization();
    const day = this.dateOnly(date);
    const holiday = await this.prisma.holiday.findFirst({ where: { organizationId: org.id, date: day } });
    if (holiday && !holiday.isOptional) return { working: false, type: "HOLIDAY", holiday };
    const working = this.workingForWeekday(day, policy);
    return { working, type: working ? "WORKING_DAY" : "WEEKEND", holiday: holiday ?? null };
  }

  async isWorkingDay(date: Date) {
    const org = await this.getOrganization();
    return this.resolveWorkingDay(date, this.organizationPolicy(org));
  }

  async isWorkingDayForDepartment(departmentId: string | null | undefined, date: Date) {
    return this.resolveWorkingDay(date, await this.getDepartmentPolicy(departmentId));
  }

  async isWorkingDayForEmployee(employeeId: string, date: Date) {
    return this.resolveWorkingDay(date, await this.getEmployeePolicy(employeeId));
  }

  async settings() {
    const org = await this.getOrganization();
    return {
      id: org.id, name: org.name, timezone: org.timezone,
      officeStartMinutes: org.officeStartMinutes, officeEndMinutes: org.officeEndMinutes,
      lunchStartMinutes: org.lunchStartMinutes, lunchEndMinutes: org.lunchEndMinutes,
      lateGraceMinutes: org.lateGraceMinutes,
      attendanceCallStartMinutes: org.attendanceCallStartMinutes,
      attendanceCallEndMinutes: org.attendanceCallEndMinutes,
      attendanceAbsenceCutoffMinutes: org.attendanceAbsenceCutoffMinutes,
      dprSlaMinutes: org.dprSlaMinutes, dprReminder1Minutes: org.dprReminder1Minutes,
      dprReminder2Minutes: org.dprReminder2Minutes,
      kraStrikeThresholdScore: org.kraStrikeThresholdScore,
      kraRollingWindowMonths: org.kraRollingWindowMonths,
      kraStrikesToEscalate: org.kraStrikesToEscalate,
      saturdayWorkPattern: org.saturdayWorkPattern,
    };
  }

  async updateSettings(dto: CalendarSettingsDto) {
    const org = await this.getOrganization();
    const officeStart = dto.officeStartMinutes ?? org.officeStartMinutes;
    const officeEnd = dto.officeEndMinutes ?? org.officeEndMinutes;
    const lunchStart = dto.lunchStartMinutes ?? org.lunchStartMinutes;
    const lunchEnd = dto.lunchEndMinutes ?? org.lunchEndMinutes;
    const callStart = dto.attendanceCallStartMinutes ?? org.attendanceCallStartMinutes;
    const callEnd = dto.attendanceCallEndMinutes ?? org.attendanceCallEndMinutes;
    const reminder1 = dto.dprReminder1Minutes ?? org.dprReminder1Minutes;
    const reminder2 = dto.dprReminder2Minutes ?? org.dprReminder2Minutes;
    const sla = dto.dprSlaMinutes ?? org.dprSlaMinutes;
    if (officeEnd <= officeStart) throw new BadRequestException("Office end time must be after office start time");
    if (lunchEnd <= lunchStart) throw new BadRequestException("Lunch end time must be after lunch start time");
    if (callEnd <= callStart) throw new BadRequestException("Attendance call end time must be after start time");
    if (reminder2 <= reminder1) throw new BadRequestException("DPR reminder 2 must be after reminder 1");
    if (reminder2 >= sla) throw new BadRequestException("The second DPR reminder must be before the submission SLA");
    return this.prisma.organization.update({ where: { id: org.id }, data: dto });
  }

  async listHolidays(year: number) {
    const org = await this.getOrganization();
    return this.prisma.holiday.findMany({
      where: { organizationId: org.id, date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      orderBy: { date: "asc" },
    });
  }

  async createHoliday(dto: HolidayDto & { audienceNote?: string }) {
    const org = await this.getOrganization();
    const date = this.dateOnly(dto.date);
    const existing = await this.prisma.holiday.findFirst({ where: { organizationId: org.id, date } });
    if (existing) throw new BadRequestException(`A holiday already exists on ${this.dateKey(date)}`);
    return this.prisma.holiday.create({ data: { organizationId: org.id, name: dto.name, date, isOptional: dto.isOptional ?? false, audienceNote: dto.audienceNote } });
  }

  async updateHoliday(id: string, dto: HolidayDto & { audienceNote?: string }) {
    const org = await this.getOrganization();
    const holiday = await this.prisma.holiday.findFirst({ where: { id, organizationId: org.id } });
    if (!holiday) throw new NotFoundException("Holiday not found");
    const date = this.dateOnly(dto.date);
    const conflict = await this.prisma.holiday.findFirst({ where: { organizationId: org.id, date, id: { not: id } } });
    if (conflict) throw new BadRequestException(`A holiday already exists on ${this.dateKey(date)}`);
    return this.prisma.holiday.update({ where: { id }, data: { name: dto.name, date, isOptional: dto.isOptional ?? false, audienceNote: dto.audienceNote } });
  }

  async deleteHoliday(id: string) {
    const org = await this.getOrganization();
    const holiday = await this.prisma.holiday.findFirst({ where: { id, organizationId: org.id } });
    if (!holiday) throw new NotFoundException("Holiday not found");
    return this.prisma.holiday.delete({ where: { id } });
  }

  async countWorkingDays(startDate: Date, endDate: Date) {
    const start = this.dateOnly(startDate); const end = this.dateOnly(endDate);
    if (end < start) return 0;
    let count = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if ((await this.isWorkingDay(d)).working) count++;
    return count;
  }

  async countWorkingDaysForEmployee(employeeId: string, startDate: Date, endDate: Date) {
    const start = this.dateOnly(startDate); const end = this.dateOnly(endDate);
    if (end < start) return 0;
    let count = 0;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) if ((await this.isWorkingDayForEmployee(employeeId, d)).working) count++;
    return count;
  }

  async workingDaySummary(month: number, year: number, departmentId?: string) {
    const policy = departmentId ? await this.getDepartmentPolicy(departmentId) : this.organizationPolicy(await this.getOrganization());
    const org = await this.getOrganization();
    const holidays = await this.prisma.holiday.findMany({ where: { organizationId: org.id, date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } } });
    const holidayMap = new Map(holidays.map((h) => [this.dateKey(h.date), h]));
    const days: any[] = []; const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); let workingDays = 0;
    for (let d = 1; d <= last; d++) {
      const date = new Date(Date.UTC(year, month - 1, d)); const key = this.dateKey(date); const holiday = holidayMap.get(key);
      let working = this.workingForWeekday(date, policy); let type = working ? "WORKING_DAY" : "WEEKEND";
      if (holiday && !holiday.isOptional) { working = false; type = "HOLIDAY"; }
      if (working) workingDays++;
      days.push({ date: key, day: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), working, type, holiday: holiday?.name ?? null, optionalHoliday: holiday?.isOptional ?? false, audienceNote: holiday?.audienceNote ?? null });
    }
    return { month, year, workingDays, holidays: holidays.filter(h => !h.isOptional).length, optionalHolidays: holidays.filter(h => h.isOptional).length, days };
  }

  async workingDaySummaryForEmployee(employeeId: string, month: number, year: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { departmentId: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    return this.workingDaySummary(month, year, employee.departmentId ?? undefined);
  }
}
