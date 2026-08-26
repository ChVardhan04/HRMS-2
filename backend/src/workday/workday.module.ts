import { Module } from "@nestjs/common";
import { WorkdayService } from "./workday.service";
import { WorkdayController } from "./workday.controller";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [CalendarModule],
  providers: [WorkdayService],
  controllers: [WorkdayController],
  exports: [WorkdayService],
})
export class WorkdayModule {}
