import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { GroupMonitorService } from "./group-monitor.service";
import {
  AddGroupMemberDto,
  CheckGroupDto,
  CreateGroupDto,
} from "./dto/group.dto";

@Controller("groups")
@Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
export class GroupMonitorController {
  constructor(private groupMonitorService: GroupMonitorService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto) {
    return this.groupMonitorService.createGroup(dto, user.employeeId!);
  }

  @Get()
  list() {
    return this.groupMonitorService.listGroups();
  }

  @Get("pending-today")
  pendingToday() {
    return this.groupMonitorService.pendingChecksToday();
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @Body() dto: AddGroupMemberDto) {
    return this.groupMonitorService.addMember(id, dto);
  }

  @Post(":id/sync-members")
  sync(@Param("id") id: string) {
    return this.groupMonitorService.syncMembers(id);
  }

  @Post(":id/check")
  check(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CheckGroupDto,
  ) {
    return this.groupMonitorService.recordCheck(id, user.employeeId!, dto);
  }

  @Get(":id/history")
  history(@Param("id") id: string) {
    return this.groupMonitorService.history(id);
  }
}
