CREATE TABLE "BirthdayNotificationLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BirthdayNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BirthdayNotificationLog_employeeId_year_key" ON "BirthdayNotificationLog"("employeeId", "year");
CREATE INDEX "BirthdayNotificationLog_year_idx" ON "BirthdayNotificationLog"("year");

ALTER TABLE "BirthdayNotificationLog" ADD CONSTRAINT "BirthdayNotificationLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
