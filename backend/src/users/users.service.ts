import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { name: true } } } },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, title: true } },
            managerId: true,
            phone: true,
            personalEmail: true,
            location: true,
            dateOfBirth: true,
            dateOfJoining: true,
            employmentType: true,
            employmentStatus: true,
          },
        },
      },
    });
  }

  async updateMyProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      personalEmail?: string;
      location?: string;
      dateOfBirth?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employee: { select: { id: true } } },
    });
    if (!user?.employee)
      throw new NotFoundException("Employee profile not found");

    await this.prisma.employee.update({
      where: { id: user.employee.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        personalEmail: data.personalEmail,
        location: data.location,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
    });

    return this.findMe(userId);
  }
}
