import { Module } from "@nestjs/common";
import { StrikesService } from "./strikes.service";
import { StrikesController } from "./strikes.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  providers: [StrikesService],
  controllers: [StrikesController],
  exports: [StrikesService],
})
export class StrikesModule {}
