import { Module } from "@nestjs/common";
import { TodosService } from "./todos.service";
import { TodosController } from "./todos.controller";
import { WorkdayModule } from "../workday/workday.module";
import { DprModule } from "../dpr/dpr.module";

@Module({
  imports: [WorkdayModule, DprModule],
  providers: [TodosService],
  controllers: [TodosController],
  exports: [TodosService],
})
export class TodosModule {}
