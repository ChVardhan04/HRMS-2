import {
  Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { LeaveService } from "./leave.service";
import { ApplyLeaveDto, CreateLeaveTypeDto, LeavePreviewDto, RejectLeaveDto, SetLeaveBalanceDto } from "./dto/leave.dto";

@Controller("leave")
export class LeaveController {
  constructor(private leaveService: LeaveService) {}

  @Get("types") types() { return this.leaveService.listTypes(); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("types") createType(@Body() dto: CreateLeaveTypeDto) { return this.leaveService.createType(dto); }

  @Get("balances")
  balances(@CurrentUser() user: AuthenticatedUser, @Query("year") year?: string) { return this.leaveService.balances(user.employeeId!, year ? Number(year) : undefined); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("admin/overview")
  adminOverview(@Query("year") year: string, @Query("month") month: string, @Query("departmentId") departmentId?: string) {
    const now = new Date();
    return this.leaveService.adminOverview(Number(year) || now.getFullYear(), Number(month) || now.getMonth() + 1, departmentId);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("admin/balances/:employeeId/:leaveTypeId")
  setBalance(@Param("employeeId") employeeId: string, @Param("leaveTypeId") leaveTypeId: string, @Query("year") year: string, @Body() dto: SetLeaveBalanceDto) {
    return this.leaveService.setBalance(employeeId, leaveTypeId, Number(year) || new Date().getFullYear(), dto);
  }

  @Post("preview")
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: LeavePreviewDto) { return this.leaveService.preview(user.employeeId!, dto); }

  @Post("apply")
  @UseInterceptors(FileInterceptor("medicalCertificate", { limits: { fileSize: 10 * 1024 * 1024 } }))
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyLeaveDto, @UploadedFile() medicalCertificate?: Express.Multer.File) {
    return this.leaveService.apply(user.employeeId!, dto, medicalCertificate);
  }

  @Get("history") history(@CurrentUser() user: AuthenticatedUser) { return this.leaveService.history(user.employeeId!); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("approvals") approvals(@CurrentUser() user: AuthenticatedUser) { return this.leaveService.pendingApprovals(user.employeeId!, user.roles); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("team-calendar")
  teamCalendar(@CurrentUser() user: AuthenticatedUser, @Query("from") from: string, @Query("to") to: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.leaveService.teamCalendar(user.employeeId!, fromDate, toDate, user.roles);
  }

  @Get(":id/medical-certificate")
  medicalCertificate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.leaveService.medicalCertificateDownload(id, user); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/manager-approve") managerApprove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.leaveService.managerApprove(id, user.employeeId!); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/hr-approve") hrApprove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.leaveService.hrApprove(id, user.employeeId!); }
  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/reject") reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: RejectLeaveDto) { return this.leaveService.reject(id, user.employeeId!, user.roles, dto.reason); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/reverse") reverse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.leaveService.reverseApproved(id, user.employeeId!); }
  @Patch(":id/cancel") cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.leaveService.cancel(id, user.employeeId!); }
}
