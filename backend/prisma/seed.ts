import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const initialHrEmail = process.env.INITIAL_HR_EMAIL?.trim().toLowerCase();
  const initialHrPassword = process.env.INITIAL_HR_PASSWORD;

  if (!initialHrEmail) {
    throw new Error('INITIAL_HR_EMAIL must be set');
  }

  if (!initialHrPassword || initialHrPassword.length < 12) {
    throw new Error('INITIAL_HR_PASSWORD must be set and contain at least 12 characters');
  }

  const initialHrPasswordHash = await bcrypt.hash(initialHrPassword, 12);

  console.log('Seeding roles & permissions...');
  const roleDefs: { name: RoleName; description: string }[] = [
    { name: 'EMPLOYEE', description: 'Own attendance, to-dos, DPR, leave, view own KRA' },
    { name: 'MANAGER', description: 'Team attendance, DPR review, to-do assignment, leave approval, team KRA, hiring feedback' },
    { name: 'HR_ADMIN', description: 'Employee administration, ATS, group monitoring, KRA configuration, reports and document management' },
    { name: 'LEADERSHIP', description: 'Read-only dashboards and organization-wide reports' },
    { name: 'SUPER_ADMIN', description: 'System configuration, integrations and RBAC management' },
  ];

  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) {
    roles[def.name] = await prisma.role.upsert({
      where: { name: def.name },
      create: def,
      update: { description: def.description },
    });
  }

  console.log('Seeding organization, departments and designations...');
  const org = await prisma.organization.upsert({
    where: { domain: 'webisdom.com' },
    create: {
      name: 'Webisdom',
      domain: 'webisdom.com',
      timezone: 'Asia/Kolkata',
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
      kraStrikeThresholdScore: 80,
      kraRollingWindowMonths: 6,
      kraStrikesToEscalate: 3,
      saturdayWorkPattern: 'FIRST_THIRD_WORKING',
    },
    update: {
      name: 'Webisdom',
      timezone: 'Asia/Kolkata',
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
      kraStrikeThresholdScore: 80,
      kraRollingWindowMonths: 6,
      kraStrikesToEscalate: 3,
      saturdayWorkPattern: 'FIRST_THIRD_WORKING',
    },
  });

  const engineering = await prisma.department.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Engineering' } },
    create: { organizationId: org.id, name: 'Engineering' },
    update: {},
  });

  const humanResources = await prisma.department.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Human Resources' } },
    create: { organizationId: org.id, name: 'Human Resources' },
    update: {},
  });

  await prisma.designation.upsert({
    where: { departmentId_title: { departmentId: engineering.id, title: 'Software Engineer' } },
    create: { departmentId: engineering.id, title: 'Software Engineer' },
    update: {},
  });

  const hrManagerTitle = await prisma.designation.upsert({
    where: { departmentId_title: { departmentId: humanResources.id, title: 'HR Manager' } },
    create: { departmentId: humanResources.id, title: 'HR Manager' },
    update: {},
  });

  console.log('Seeding leave types...');
  const leaveTypeDefs = [
    { code: 'CL', name: 'Casual Leave', accrualPerMonth: 1 },
    { code: 'SL', name: 'Sick Leave', accrualPerMonth: 1 },
    { code: 'EL', name: 'Earned Leave', accrualPerMonth: 1.5 },
    { code: 'WFH', name: 'Work From Home', accrualPerMonth: 0 },
    { code: 'UNPAID', name: 'Unpaid Leave', accrualPerMonth: 0 },
    { code: 'MATERNITY', name: 'Maternity Leave', accrualPerMonth: 0 },
    { code: 'PATERNITY', name: 'Paternity Leave', accrualPerMonth: 0 },
    { code: 'COMP_OFF', name: 'Compensatory Off', accrualPerMonth: 0 },
  ];

  for (const lt of leaveTypeDefs) {
    await prisma.leaveType.upsert({
      where: { code: lt.code },
      create: { ...lt, organizationId: org.id },
      update: { ...lt, organizationId: org.id },
    });
  }

  console.log('Seeding default KRA template...');
  await prisma.kRATemplate.upsert({
    where: { id: 'seed-default-template' },
    create: {
      id: 'seed-default-template',
      organizationId: org.id,
      roleName: 'All Employees',
      isDefault: true,
      items: {
        create: [
          { name: 'DPR_SUBMISSION', weightPercent: 20, isAutomated: true },
          { name: 'TASK_COMPLETION', weightPercent: 30, isAutomated: true },
          { name: 'ATTENDANCE', weightPercent: 20, isAutomated: true },
          { name: 'DPR_QUALITY', weightPercent: 15, isAutomated: true },
          { name: 'COLLABORATION', weightPercent: 15, isAutomated: false },
        ],
      },
    },
    update: {},
  });

  // Remove the old development accounts if this database was seeded by an earlier build.
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          'hr.admin@hrms.local',
          'manager@hrms.local',
          'employee@hrms.local',
        ],
      },
    },
  });

  console.log('Creating initial HR administrator...');

  const existingUser = await prisma.user.findUnique({ where: { email: initialHrEmail } });
  let hrUserId: string;

  if (existingUser) {
    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: initialHrPasswordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        isActive: true,
        mustChangePassword: false,
        roles: {
          deleteMany: {},
          create: [{ roleId: roles.HR_ADMIN.id }],
        },
      },
    });
    hrUserId = updated.id;
  } else {
    const created = await prisma.user.create({
      data: {
        email: initialHrEmail,
        passwordHash: initialHrPasswordHash,
        isActive: true,
        mustChangePassword: false,
        roles: { create: [{ roleId: roles.HR_ADMIN.id }] },
      },
    });
    hrUserId = created.id;
  }

  const existingHrEmployee = await prisma.employee.findUnique({ where: { userId: hrUserId } });
  if (!existingHrEmployee) {
    await prisma.employee.create({
      data: {
        employeeCode: `EMP-${Math.floor(100000 + Math.random() * 900000)}`,
        userId: hrUserId,
        firstName: 'HR',
        lastName: 'Administrator',
        dateOfJoining: new Date(),
        employmentStatus: 'CONFIRMED',
        departmentId: humanResources.id,
        designationId: hrManagerTitle.id,
      },
    });
  }

  const holidays = [
    { name: 'Independence Day', date: new Date('2026-08-15T00:00:00.000Z') },
    { name: 'Republic Day', date: new Date('2027-01-26T00:00:00.000Z') },
  ];

  for (const holiday of holidays) {
    await prisma.holiday.upsert({
      where: { organizationId_date_name: { organizationId: org.id, date: holiday.date, name: holiday.name } },
      create: { ...holiday, organizationId: org.id },
      update: {},
    });
  }

  await prisma.policy.upsert({
    where: { id: 'seed-policy-attendance' },
    create: {
      id: 'seed-policy-attendance',
      organizationId: org.id,
      title: 'Attendance & WorkDay Policy',
      description: 'Check in before starting work, keep attendance accurate, and submit your DPR by the configured SLA.',
      publishedAt: new Date(),
    },
    update: {},
  });

  console.log('');
  console.log('HRMS seed complete.');
  console.log(`Initial HR account: ${initialHrEmail}`);
  console.log('Managers and employees are created through the HR portal.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
