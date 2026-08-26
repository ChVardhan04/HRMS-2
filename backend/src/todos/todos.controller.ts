import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { TodosService } from "./todos.service";
import {
  CompleteTodoDto,
  CreateTodoDto,
  TodoQueryDto,
  UpdateTodoDto,
  ResolveTodoDto,
} from "./dto/todo.dto";

@Controller("todos")
export class TodosController {
  constructor(private todosService: TodosService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTodoDto) {
    return this.todosService.create(user.employeeId!, user.roles, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TodoQueryDto,
  ) {
    return this.todosService.findAll(query, user);
  }

  @Get("today")
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.todosService.today(user.employeeId!);
  }

  @Get("eod-status")
  eodStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.todosService.eodStatus(user.employeeId!);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("eod-monitor")
  eodMonitor(@CurrentUser() user: AuthenticatedUser) {
    return this.todosService.eodMonitor();
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todosService.update(id, user.employeeId!, dto, user.roles);
  }

  @Patch(":id/complete")
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CompleteTodoDto,
  ) {
    return this.todosService.complete(
      id,
      user.employeeId!,
      dto.actualHours,
      dto.outputSummary,
    );
  }


  @Post(":id/resolve")
  @UseInterceptors(
    FileInterceptor("proof", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype));
      },
    }),
  )
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ResolveTodoDto,
    @UploadedFile() proof?: Express.Multer.File,
  ) {
    return this.todosService.resolve(id, user.employeeId!, dto, proof);
  }

  @Get(":id/proof")
  proof(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.todosService.getProof(id, user.employeeId!, user.roles);
  }

  @Post(":id/comments")
  comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body("body") body: string,
  ) {
    return this.todosService.addComment(id, user.employeeId!, body);
  }

  @Post("bulk")
  bulk(
    @Body("ids") ids: string[],
    @Body("action") action: "complete" | "reschedule" | "reassign" | "cancel",
    @Body("payload") payload: { dueDate?: string; assigneeId?: string } = {},
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.todosService.bulkAction(
      ids,
      action,
      payload,
      user.employeeId!,
      user.roles,
    );
  }
}
