import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_DEPARTMENTS = ['Namandarshan', 'Traininglobe', 'Webisdom', 'Dentedge', 'Perfecto', 'Human Resources'];


async function main() {
  const initialHrEmail = process.env.INITIAL_HR_EMAIL?.trim().toLowerCase();
  const initialHrPassword = process.env.INITIAL_HR_PASSWORD;
  if (!initialHrEmail) throw new Error('INITIAL_HR_EMAIL must be set');
  if (!initialHrPassword || initialHrPassword.length < 12) throw new Error('INITIAL_HR_PASSWORD must be set and contain at least 12 characters');
  const initialHrPasswordHash = await bcrypt.hash(initialHrPassword, 12);

  console.log('Seeding roles...');
  const roleDefs: { name: RoleName; description: string }[] = [
    { name: 'EMPLOYEE', description: 'Own attendance, to-dos, DPR, leave and KRA' },
    { name: 'MANAGER', description: 'Team attendance, DPR review, tasks, leave and team KRA' },
    { name: 'HR_ADMIN', description: 'HR administration, policies, department configuration, ATS, KRA and reports' },
    { name: 'LEADERSHIP', description: 'Read-only organization reporting' },
    { name: 'SUPER_ADMIN', description: 'System configuration and RBAC' },
  ];
  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) roles[def.name] = await prisma.role.upsert({ where: { name: def.name }, create: def, update: { description: def.description } });

  const org = await prisma.organization.upsert({
    where: { domain: 'webisdom.com' },
    create: {
      name: 'Webisdom Group', domain: 'webisdom.com', timezone: 'Asia/Kolkata',
      officeStartMinutes: 570, officeEndMinutes: 1140, lunchStartMinutes: 810, lunchEndMinutes: 840,
      lateGraceMinutes: 60, attendanceCallStartMinutes: 555, attendanceCallEndMinutes: 570,
      attendanceAbsenceCutoffMinutes: 780, dprSlaMinutes: 1320, dprReminder1Minutes: 1080,
      dprReminder2Minutes: 1200, kraStrikeThresholdScore: 80, kraRollingWindowMonths: 6,
      kraStrikesToEscalate: 3, saturdayWorkPattern: 'FIRST_THIRD_WORKING',
    },
    update: { name: 'Webisdom Group', timezone: 'Asia/Kolkata', officeStartMinutes: 570, officeEndMinutes: 1140, lunchStartMinutes: 810, lunchEndMinutes: 840, attendanceAbsenceCutoffMinutes: 780 },
  });

  console.log('Seeding departments and HR-configurable policies...');
  const departments: Record<string, any> = {};
  for (const name of DEFAULT_DEPARTMENTS) {
    const department = await prisma.department.upsert({ where: { organizationId_name: { organizationId: org.id, name } }, create: { organizationId: org.id, name }, update: { deletedAt: null } });
    departments[name] = department;
    await prisma.departmentPolicy.upsert({
      where: { departmentId: department.id },
      create: {
        departmentId: department.id,
        mondayWorking: true, tuesdayWorking: true, wednesdayWorking: true, thursdayWorking: true, fridayWorking: true,
        saturdayWorking: false, sundayWorking: false,
        officeStartMinutes: 570, officeEndMinutes: 1140, lunchStartMinutes: 810, lunchEndMinutes: 840,
        checkInOpenMinutes: 570, lateAfterMinutes: 630, halfDayAfterMinutes: 645, checkInCutoffMinutes: 780, autoAbsentMinutes: 780,
        allowedLatesPerMonth: 2, firstLatePenaltyDays: 0, secondLatePenaltyDays: 0, thirdPlusLatePenaltyDays: 1,
        sandwichLeaveEnabled: true, sandwichIncludesPreviousWorkingDay: true, probationMonthlyLeaveLimit: 1, probationMaxDaysPerRequest: 1,
      },
      update: {},
    });
  }

  const hrManagerTitle = await prisma.designation.upsert({
    where: { departmentId_title: { departmentId: departments['Human Resources'].id, title: 'HR Manager' } },
    create: { departmentId: departments['Human Resources'].id, title: 'HR Manager' }, update: {},
  });

  console.log('Seeding department-scoped designations...');
  const webisdomDesignationTitles = [
    'Digital Analyst & Lead Generation Intern','Digital Quality Check Team','SEO Onpage','SEO Off Page','SEO Off Page Team Lead','SEO Analyst','Social Media','Digital Analyst Intern','Designer','Client Servicing & Project Handling','BD Team'
  ];
  const webisdomDesignations: Record<string, any> = {};
  for (const title of webisdomDesignationTitles) {
    webisdomDesignations[title] = await prisma.designation.upsert({
      where: { departmentId_title: { departmentId: departments['Webisdom'].id, title } },
      create: { departmentId: departments['Webisdom'].id, title }, update: { deletedAt: null },
    });
  }
  for (const name of ['Namandarshan','Traininglobe','Dentedge','Perfecto']) {
    await prisma.designation.upsert({
      where: { departmentId_title: { departmentId: departments[name].id, title: 'General Employee' } },
      create: { departmentId: departments[name].id, title: 'General Employee' }, update: { deletedAt: null },
    });
  }

  console.log('Seeding leave types and department leave policies...');
  const leaveTypeDefs = [
    { code: 'CL', name: 'Casual Leave', accrualPerMonth: 0.5, isPaid: true },
    { code: 'SL', name: 'Sick Leave', accrualPerMonth: 7 / 12, isPaid: true },
    { code: 'EL', name: 'Earned Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'WFH', name: 'Work From Home', accrualPerMonth: 0, isPaid: true },
    { code: 'UNPAID', name: 'Unpaid Leave', accrualPerMonth: 0, isPaid: false },
    { code: 'MATERNITY', name: 'Maternity Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'PATERNITY', name: 'Paternity Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'COMP_OFF', name: 'Compensatory Off', accrualPerMonth: 0, isPaid: true },
  ];
  const leaveTypes: Record<string, any> = {};
  for (const lt of leaveTypeDefs) {
    const row = await prisma.leaveType.upsert({ where: { code: lt.code }, create: { ...lt, organizationId: org.id }, update: { ...lt, organizationId: org.id } });
    leaveTypes[lt.code] = row;
  }
  for (const department of Object.values(departments) as any[]) {
    for (const lt of Object.values(leaveTypes) as any[]) {
      const c = lt.code;
      const policy = c === 'CL'
        ? { annualEntitlement: 6, requiresBalance: true, advanceNoticeWorkingDays: 2, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true }
        : c === 'SL'
          ? { annualEntitlement: 7, requiresBalance: true, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: 1, sandwichApplies: true }
          : c === 'UNPAID' || c === 'WFH'
            ? { annualEntitlement: 0, requiresBalance: false, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: null, sandwichApplies: false }
            : { annualEntitlement: 0, requiresBalance: lt.isPaid, advanceNoticeWorkingDays: 0, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true };
      await prisma.departmentLeavePolicy.upsert({ where: { departmentId_leaveTypeId: { departmentId: department.id, leaveTypeId: lt.id } }, create: { departmentId: department.id, leaveTypeId: lt.id, ...policy }, update: {} });
    }
  }

  console.log('KRA library is intentionally empty. HR must configure result-driven metrics per designation.');

  console.log('Seeding holidays...');
  const holidays = [
    ['NEW YEAR','2026-01-01',false,null],['REPUBLIC DAY','2026-01-26',false,null],['HOLI','2026-03-03',false,null],
    ['BAKRID','2026-05-27',true,'To valid religious group'],['INDEPENDENCE DAY','2026-08-15',false,null],['RAKSHA BANDHAN','2026-08-28',false,null],
    ['MAHATMA GANDHI JAYANTI','2026-10-02',false,null],['VIJAYA DASHAMI/DUSSEHRA','2026-10-20',true,'To valid religious group'],['DEEPAWALI','2026-11-08',false,null],['CHRISTMAS','2026-12-25',false,null],
  ] as const;
  for (const [name, date, isOptional, audienceNote] of holidays) {
    const d = new Date(`${date}T00:00:00.000Z`);
    await prisma.holiday.upsert({ where: { organizationId_date_name: { organizationId: org.id, date: d, name } }, create: { organizationId: org.id, name, date: d, isOptional, audienceNote }, update: { isOptional, audienceNote } });
  }

  console.log('Creating initial HR administrator...');
  const existingUser = await prisma.user.findUnique({ where: { email: initialHrEmail } });
  let hrUserId: string;
  if (existingUser) {
    const updated = await prisma.user.update({ where: { id: existingUser.id }, data: { passwordHash: initialHrPasswordHash, failedLoginCount: 0, lockedUntil: null, isActive: true, mustChangePassword: false, roles: { deleteMany: {}, create: [{ roleId: roles.HR_ADMIN.id }] } } });
    hrUserId = updated.id;
  } else {
    hrUserId = (await prisma.user.create({ data: { email: initialHrEmail, passwordHash: initialHrPasswordHash, isActive: true, mustChangePassword: false, roles: { create: [{ roleId: roles.HR_ADMIN.id }] } } })).id;
  }
  const existingHr = await prisma.employee.findUnique({ where: { userId: hrUserId } });
  if (!existingHr) await prisma.employee.create({ data: { employeeCode: `EMP-${Math.floor(100000 + Math.random()*900000)}`, userId: hrUserId, firstName: 'HR', lastName: 'Administrator', dateOfJoining: new Date(), employmentStatus: 'CONFIRMED', departmentId: departments['Human Resources'].id, designationId: hrManagerTitle.id } });

  await prisma.policy.upsert({ where: { id: 'seed-policy-attendance' }, create: { id: 'seed-policy-attendance', organizationId: org.id, title: 'Leave & Attendance Policy', description: 'Department-aware working calendar, attendance, late-entry, leave, sandwich leave and daily delivery rules are configured by HR.', publishedAt: new Date() }, update: { description: 'Department-aware working calendar, attendance, late-entry, leave, sandwich leave and daily delivery rules are configured by HR.' } });
  console.log(`HRMS seed complete. Initial HR: ${initialHrEmail}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => prisma.$disconnect());
