import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { DepartmentsService } from "./departments.service";
import {
  CreateDepartmentDto,
  CreateDesignationDto,
  DepartmentLeavePolicyDto,
  DepartmentPolicyDto,
  UpdateDepartmentDto,
} from "./dto/department.dto";

@Controller("departments")
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  list() { return this.departmentsService.listDepartments(); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get(":id")
  get(@Param("id") id: string, @Query("month") month?: string, @Query("year") year?: string) {
    return this.departmentsService.getDepartment(id, Number(month) || undefined, Number(year) || undefined);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "department.create", entityType: "Department" })
  @Post()
  create(@Body() dto: CreateDepartmentDto) { return this.departmentsService.createDepartment(dto); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDepartmentDto) { return this.departmentsService.updateDepartment(id, dto); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/policy")
  updatePolicy(@Param("id") id: string, @Body() dto: DepartmentPolicyDto) { return this.departmentsService.updatePolicy(id, dto); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch(":id/leave-policy")
  updateLeavePolicy(@Param("id") id: string, @Body() dto: DepartmentLeavePolicyDto) { return this.departmentsService.updateLeavePolicy(id, dto); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("designations")
  createDesignation(@Body() dto: CreateDesignationDto) { return this.departmentsService.createDesignation(dto); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "department.delete", entityType: "Department" })
  @Delete(":id")
  remove(@Param("id") id: string) { return this.departmentsService.softDeleteDepartment(id); }
}
