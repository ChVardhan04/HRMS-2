import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateGroupDto,
  AddGroupMemberDto,
  CheckGroupDto,
} from "./dto/group.dto";
import { WorkdayService } from "../workday/workday.service";

@Injectable()
export class GroupMonitorService {
  constructor(
    private prisma: PrismaService,
    private workdayService: WorkdayService,
  ) {}

  async createGroup(dto: CreateGroupDto, ownerId: string) {
    return this.prisma.communicationGroup.create({
      data: {
        name: dto.name,
        platform: dto.platform,
        inviteLink: dto.inviteLink,
        ownerId: dto.ownerId ?? ownerId,
      },
    });
  }

  async listGroups() {
    return this.prisma.communicationGroup.findMany({
      where: { isActive: true },
      include: {
        owner: { select: { firstName: true, lastName: true } },
        members: { include: { employee: true } },
        checkLogs: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
    });
  }

  async addMember(groupId: string, dto: AddGroupMemberDto) {
    return this.prisma.groupMember.create({
      data: {
        groupId,
        employeeId: dto.employeeId,
        externalName: dto.externalName,
      },
    });
  }

  /** Cross-checks members against the employee master — flags ex-employees still in the group (plan 5.2/21). */
  async syncMembers(groupId: string) {
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, employeeId: { not: null } },
      include: { employee: true },
    });

    const flagged: string[] = [];
    for (const member of members) {
      const isExEmployee = member.employee?.employmentStatus === "EXITED";
      if (isExEmployee !== member.isExEmployeeFlag) {
        await this.prisma.groupMember.update({
          where: { id: member.id },
          data: { isExEmployeeFlag: isExEmployee },
        });
      }
      if (isExEmployee)
        flagged.push(
          `${member.employee?.firstName} ${member.employee?.lastName}`,
        );
    }
    return { flaggedExEmployees: flagged };
  }

  async recordCheck(groupId: string, checkedById: string, dto: CheckGroupDto) {
    const group = await this.prisma.communicationGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException("Group not found");

    return this.prisma.groupCheckLog.create({
      data: {
        groupId,
        checkedById,
        notes: dto.notes,
        escalated: dto.escalated ?? false,
        escalationNote: dto.escalationNote,
      },
    });
  }

  /** HR daily-workflow widget from plan section 9: "Groups pending check (N)". */
  async pendingChecksToday() {
    const startOfDay = this.workdayService.startOfDay();
    const groups = await this.prisma.communicationGroup.findMany({
      where: { isActive: true },
      include: { checkLogs: { where: { checkedAt: { gte: startOfDay } } } },
    });

    return groups.filter((g) => g.checkLogs.length === 0);
  }

  async history(groupId: string) {
    return this.prisma.groupCheckLog.findMany({
      where: { groupId },
      include: { checkedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { checkedAt: "desc" },
    });
  }
}
