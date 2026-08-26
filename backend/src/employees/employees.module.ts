import { Module } from "@nestjs/common";
import { EmployeesService } from "./employees.service";
import { EmployeesController } from "./employees.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
