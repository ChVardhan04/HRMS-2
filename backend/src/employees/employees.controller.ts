import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../common/decorators/current-user.decorator";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { EmployeesService } from "./employees.service";
import {
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateEmployeeDto,
} from "./dto/employee.dto";

@Controller("employees")
export class EmployeesController {
  constructor(private employeesService: EmployeesService) {}

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "employee.create", entityType: "Employee" })
  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(query, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Get("my-reports")
  myReports(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.myReports(user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.MANAGER, RoleName.SUPER_ADMIN)
  @Get("org-hierarchy")
  orgHierarchy() {
    return this.employeesService.orgHierarchy();
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "employee.activation.resend", entityType: "Employee" })
  @Post(":id/resend-activation")
  resendActivation(@Param("id") id: string) {
    return this.employeesService.resendActivation(id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.employeesService.findOne(id, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "employee.update", entityType: "Employee" })
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, dto, user);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "employee.deactivate", entityType: "Employee" })
  @Patch(":id/deactivate")
  deactivate(@Param("id") id: string) {
    return this.employeesService.deactivate(id);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "employee.reactivate", entityType: "Employee" })
  @Patch(":id/reactivate")
  reactivate(@Param("id") id: string) {
    return this.employeesService.reactivate(id);
  }
}
