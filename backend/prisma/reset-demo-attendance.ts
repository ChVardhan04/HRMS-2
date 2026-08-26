import { PrismaClient, AttendanceStatus, DprStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_EMAILS = ['hr.admin@hrms.local', 'manager@hrms.local', 'employee@hrms.local'];

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { email: true, employee: { select: { id: true, firstName: true, lastName: true } } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const user of users) {
    if (!user.employee) continue;
    const workDay = await prisma.workDay.findUnique({
      where: { employeeId_date: { employeeId: user.employee.id, date: today } },
    });
    if (!workDay) continue;

    await prisma.attendanceRecord.deleteMany({ where: { workDayId: workDay.id } });
    await prisma.workDay.update({
      where: { id: workDay.id },
      data: {
        attendanceStatus: AttendanceStatus.ABSENT,
        checkInAt: null,
        checkOutAt: null,
        workingHours: null,
        isLate: false,
        isEarlyDeparture: false,
        totalLoggedHours: 0,
        dprStatus: DprStatus.DRAFT,
      },
    });
    console.log(`Reset attendance: ${user.email}`);
  }
}

main().finally(() => prisma.$disconnect());
