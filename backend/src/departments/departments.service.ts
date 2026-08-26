import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDepartmentDto,
  CreateDesignationDto,
} from "./dto/department.dto";

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private async defaultOrgId() {
    const org = await this.prisma.organization.findFirst();
    return org?.id;
  }

  async listDepartments() {
    return this.prisma.department.findMany({
      where: { deletedAt: null },
      include: { designations: { where: { deletedAt: null } } },
      orderBy: { name: "asc" },
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const organizationId = await this.defaultOrgId();
    return this.prisma.department.create({
      data: { name: dto.name, organizationId: organizationId! },
    });
  }

  async createDesignation(dto: CreateDesignationDto) {
    return this.prisma.designation.create({ data: dto });
  }

  async softDeleteDepartment(id: string) {
    return this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
