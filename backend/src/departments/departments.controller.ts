import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { Audit } from "../common/decorators/audit.decorator";
import { DepartmentsService } from "./departments.service";
import {
  CreateDepartmentDto,
  CreateDesignationDto,
} from "./dto/department.dto";

@Controller("departments")
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @Get()
  list() {
    return this.departmentsService.listDepartments();
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "department.create", entityType: "Department" })
  @Post()
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.createDepartment(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("designations")
  createDesignation(@Body() dto: CreateDesignationDto) {
    return this.departmentsService.createDesignation(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Audit({ action: "department.delete", entityType: "Department" })
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.departmentsService.softDeleteDepartment(id);
  }
}
