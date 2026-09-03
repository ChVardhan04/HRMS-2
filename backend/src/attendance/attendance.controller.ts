import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  Get,
  Query,
} from "@nestjs/common";
import { Request } from "express";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import {
  CheckInDto,
  CheckOutDto,
  RegularisationRequestDto,
} from "./dto/attendance.dto";

@Controller("attendance")
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post("check-in")
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckInDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.checkIn(user.employeeId!, dto, req.ip);
  }

  @Post("check-in/undo")
  undoCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.attendanceService.undoCheckIn(user.employeeId!, req.ip);
  }

  @Post("check-out")
  checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckOutDto,
    @Req() req: Request,
  ) {
    return this.attendanceService.checkOut(
      user.employeeId!,
      dto,
      req.ip,
      user.roles,
    );
  }

  @Post("check-out/undo")
  undoCheckOut(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.attendanceService.undoCheckOut(user.employeeId!, req.ip);
  }

  @Post("regularise")
  regularise(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegularisationRequestDto,
  ) {
    return this.attendanceService.requestRegularisation(
      user.employeeId!,
      dto.workDayId,
      dto.reason,
      dto.requestedCheckIn,
      dto.requestedCheckOut,
    );
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("regularise/pending")
  pendingRegularisations(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.pendingRegularisations(user);
  }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("regularise/:recordId/approve")
  approveRegularisation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("recordId") recordId: string,
  ) {
    return this.attendanceService.approveRegularisation(
      recordId,
      user.employeeId!,
      user.roles,
    );
  }

  @Get("team-today")
  teamToday(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.teamAttendanceToday(
      user.employeeId!,
      user.roles,
    );
  }

  @Get("monthly/me")
  monthlyMe(@CurrentUser() user: AuthenticatedUser, @Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.attendanceService.monthlyReport(
      user.employeeId!,
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
      user,
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("monthly/team")
  monthlyTeam(@CurrentUser() user: AuthenticatedUser, @Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.attendanceService.monthlyTeamReport(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
      user,
    );
  }

  @Get("monthly/:employeeId")
  monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Param("employeeId") employeeId: string,
    @Query("month") month: string,
    @Query("year") year: string,
  ) {
    const now = new Date();
    return this.attendanceService.monthlyReport(
      employeeId,
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
      user,
    );
  }
}
