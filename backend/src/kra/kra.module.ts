import { Module } from "@nestjs/common";
import { KraService } from "./kra.service";
import { KraController } from "./kra.controller";
import { KraSchedulerService } from "./kra-scheduler.service";
import { StrikesModule } from "../strikes/strikes.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [StrikesModule, NotificationsModule, CalendarModule],
  providers: [KraService, KraSchedulerService],
  controllers: [KraController],
  exports: [KraService, KraSchedulerService],
})
export class KraModule {}
