import { Module } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [CalendarModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
