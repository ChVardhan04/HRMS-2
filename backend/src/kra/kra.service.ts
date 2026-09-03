import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { LeaveStatus, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";
import { CreateKraTemplateDto, KraItemDto } from "./dto/kra.dto";
import { KraAiService } from "./kra-ai.service";

export interface KraBreakdownItem {
  itemId: string;
  weight: number;
  achievementPercent: number;
  contribution: number;
  isAutomated: boolean;
  manualScore?: number;
  confidence?: number;
  evidence?: string;
  gaps?: string;
  targetValue?: number | null;
  targetText?: string | null;
  measurementType?: string;
}

@Injectable()
export class KraService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
    private ai: KraAiService,
  ) {}

  async listTemplates(departmentId?: string) {
    return this.prisma.kRATemplate.findMany({
      where: { isActive: true, ...(departmentId ? { OR: [{ departmentId }, { departmentId: null }] } : {}) },
      include: { department: true, designation: true, items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ departmentId: "asc" }, { roleName: "asc" }],
    });
  }

  async createTemplate(dto: CreateKraTemplateDto) {
    const org = await this.calendarService.getOrganization();
    if (dto.departmentId) {
      const d = await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: org.id, deletedAt: null } });
      if (!d) throw new NotFoundException("Department not found");
    }
    if (dto.designationId) {
      const d = await this.prisma.designation.findFirst({ where: { id: dto.designationId, deletedAt: null, department: { organizationId: org.id, deletedAt: null } } });
      if (!d) throw new NotFoundException("Designation not found");
      if (dto.departmentId && d.departmentId !== dto.departmentId) throw new BadRequestException("Designation must belong to the selected department");
    }
    return this.prisma.kRATemplate.create({ data: { organizationId: org.id, ...dto }, include: { items: true, department: true, designation: true } });
  }

  async updateTemplate(id: string, dto: Partial<CreateKraTemplateDto>) {
    const existing = await this.prisma.kRATemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("KRA template not found");
    if (dto.designationId) {
      const designation = await this.prisma.designation.findUnique({ where: { id: dto.designationId } });
      if (!designation) throw new NotFoundException("Designation not found");
      const departmentId = dto.departmentId ?? existing.departmentId;
      if (departmentId && designation.departmentId !== departmentId) throw new BadRequestException("Designation must belong to the selected department");
    }
    return this.prisma.kRATemplate.update({ where: { id }, data: dto, include: { items: { orderBy: { sortOrder: "asc" } }, department: true, designation: true } });
  }

  async addItem(templateId: string, dto: KraItemDto) {
    const template = await this.prisma.kRATemplate.findUnique({ where: { id: templateId }, include: { items: true } });
    if (!template) throw new NotFoundException("KRA template not found");
    const total = template.items.reduce((sum, i) => sum + Number(i.weightPercent), 0) + dto.weightPercent;
    if (total > 100.01) throw new BadRequestException(`KRA weights cannot exceed 100%. Current total would be ${total.toFixed(2)}%`);
    return this.prisma.kRAItem.create({ data: { templateId, ...dto } });
  }

  async updateItem(id: string, dto: Partial<KraItemDto>) {
    const item = await this.prisma.kRAItem.findUnique({ where: { id }, include: { template: { include: { items: true } } } });
    if (!item) throw new NotFoundException("KRA item not found");
    if (dto.weightPercent != null) {
      const other = item.template.items.filter((x) => x.id !== id).reduce((sum, x) => sum + Number(x.weightPercent), 0);
      if (other + dto.weightPercent > 100.01) throw new BadRequestException("KRA weights cannot exceed 100%");
    }
    return this.prisma.kRAItem.update({ where: { id }, data: dto });
  }

  async deleteItem(id: string) { return this.prisma.kRAItem.delete({ where: { id } }); }

  async getTemplateForEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { department: true, designation: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    const candidates = await this.prisma.kRATemplate.findMany({
      where: { isActive: true, OR: [
        ...(employee.designationId ? [{ designationId: employee.designationId }] : []),
        ...(employee.departmentId && employee.designation?.title ? [{ departmentId: employee.departmentId, roleName: employee.designation.title }] : []),
        ...(employee.departmentId ? [{ departmentId: employee.departmentId, roleName: "All Employees" }] : []),
        { departmentId: null, roleName: employee.designation?.title ?? "__none__" },
        { isDefault: true },
      ] },
      include: { items: { orderBy: { sortOrder: "asc" } }, department: true, designation: true },
    });
    const template = candidates.sort((a, b) => {
      const rank = (x: any) => x.designationId ? 5 : x.departmentId && x.roleName !== "All Employees" ? 4 : x.departmentId ? 3 : x.isDefault ? 1 : 2;
      return rank(b) - rank(a);
    })[0];
    if (!template) throw new NotFoundException("No KRA template configured for this employee");
    return template;
  }

  private async evidenceForPeriod(employeeId: string, start: Date, end: Date) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { department: true, designation: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    const workDays = await this.prisma.workDay.findMany({ where: { employeeId, date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
    const todos = await this.prisma.todo.findMany({ where: { assigneeId: employeeId, createdAt: { gte: start, lte: end }, status: { not: "CANCELLED" } }, select: { id: true, title: true, description: true, status: true, eodStatus: true, estimatedHours: true, actualHours: true, completedAt: true, completionOutputSummary: true, aiCompletionPercent: true, dueDate: true } });
    const dprs = await this.prisma.dPR.findMany({ where: { workDay: { employeeId, date: { gte: start, lte: end } } }, include: { entries: true }, orderBy: { createdAt: "asc" } });
    const leaves = await this.prisma.leaveRequest.findMany({ where: { employeeId, status: LeaveStatus.APPROVED, startDate: { lte: end }, endDate: { gte: start } }, include: { leaveType: true } });
    const present = workDays.filter(w => ["PRESENT", "LATE", "WORK_FROM_HOME"].includes(w.attendanceStatus)).length;
    const late = workDays.filter(w => w.isLate).length;
    const halfDay = workDays.filter(w => w.attendanceStatus === "HALF_DAY").length;
    const absent = workDays.filter(w => w.attendanceStatus === "ABSENT").length;
    const dprSubmitted = dprs.filter(d => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(d.status)).length;
    const completedTasks = todos.filter(t => t.eodStatus === "COMPLETED" || t.status === "COMPLETED").length;
    const analyzed = todos.filter(t => t.aiCompletionPercent != null);
    const aiTaskCompletion = analyzed.length ? analyzed.reduce((s,t)=>s+Number(t.aiCompletionPercent),0)/analyzed.length : null;
    const qualityRows = dprs.filter(d => d.qualityScore != null);
    const quality = qualityRows.length ? qualityRows.reduce((s,d)=>s+Number(d.qualityScore),0)/qualityRows.length : null;
    const totalHours = workDays.reduce((s,w)=>s+Number(w.workingHours ?? w.totalLoggedHours ?? 0),0);
    return {
      employee: { id: employee.id, employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}`, department: employee.department?.name ?? null, designation: employee.designation?.title ?? null },
      attendance: { workDays: workDays.length, present, late, halfDay, absent, totalHours: Number(totalHours.toFixed(2)) },
      dpr: { total: dprs.length, submitted: dprSubmitted, qualityScoreOutOf10: quality },
      tasks: { total: todos.length, completed: completedTasks, analyzedCount: analyzed.length, averageAiCompletionPercent: aiTaskCompletion == null ? null : Number(aiTaskCompletion.toFixed(1)), items: todos.slice(0, 200).map(t => ({ title:t.title, description:t.description, status:t.status, eodStatus:t.eodStatus, estimatedHours:t.estimatedHours, actualHours:t.actualHours, completedAt:t.completedAt, output:t.completionOutputSummary, aiCompletionPercent:t.aiCompletionPercent, dueDate:t.dueDate })) },
      dprEntries: dprs.flatMap(d => d.entries.map(e => ({ date:d.createdAt, project:e.project, description:e.description, hours:e.hours, output:e.output, blocker:e.blocker, tomorrowPlan:e.tomorrowPlan }))).slice(0, 300),
      leaves: leaves.map(l => ({ type:l.leaveType.name, start:l.startDate, end:l.endDate, days:l.numberOfDays })),
    };
  }

  private fallbackAchievement(item: any, evidence: any) {
    const key = item.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (["ATTENDANCE", "ATTENDANCE_COMPLIANCE"].includes(key)) {
      const denominator = evidence.attendance.workDays || 1;
      return ((evidence.attendance.present + evidence.attendance.halfDay * 0.5) / denominator) * 100;
    }
    if (key.includes("DPR") || key.includes("DAILY_REPORT") || key.includes("REPORTING")) {
      return evidence.attendance.workDays ? (evidence.dpr.submitted / evidence.attendance.workDays) * 100 : 100;
    }
    if (key.includes("TASK") || key.includes("PRODUCTIVITY") || key.includes("DEADLINE") || key.includes("COMPLETENESS")) {
      if (evidence.tasks.averageAiCompletionPercent != null) return evidence.tasks.averageAiCompletionPercent;
      return evidence.tasks.total ? (evidence.tasks.completed / evidence.tasks.total) * 100 : 0;
    }
    if (key.includes("QUALITY") || key.includes("ACCURACY")) {
      return evidence.dpr.qualityScoreOutOf10 == null ? 50 : evidence.dpr.qualityScoreOutOf10 * 10;
    }
    return evidence.tasks.total || evidence.dprEntries.length ? 50 : 0;
  }

  private metricPayload(template: any) {
    return template.items.map((item: any) => ({ itemId: item.id, name: item.name, description: item.description, weightPercent: Number(item.weightPercent), targetValue: item.targetValue == null ? null : Number(item.targetValue), targetText: item.targetText, unit: item.unit, measurementType: item.measurementType, isAutomated: item.isAutomated }));
  }

  private async scoreMetrics(template: any, evidence: any, period: "daily" | "monthly") {
    const metrics = this.metricPayload(template);
    const aiResult = await this.ai.evaluate(metrics, evidence, period);
    const aiMap = new Map((aiResult?.results ?? []).map((r) => [r.itemId, r]));
    const breakdown: Record<string, KraBreakdownItem> = {};
    let finalScore = 0;
    for (const item of template.items) {
      const ai = aiMap.get(item.id);
      const achievement = ai ? ai.achievementPercent : this.fallbackAchievement(item, evidence);
      const weight = Number(item.weightPercent);
      const contribution = weight / 100 * achievement;
      breakdown[item.id] = { itemId:item.id, weight, achievementPercent:Number(achievement.toFixed(1)), contribution:Number(contribution.toFixed(2)), isAutomated:true, confidence:ai?.confidence ?? 45, evidence:ai?.evidence ?? "Deterministic evidence-based calculation", gaps:ai?.gaps ?? (aiResult ? "" : "Configure OPENAI_API_KEY for AI evaluation."), targetValue:item.targetValue == null ? null : Number(item.targetValue), targetText:item.targetText, measurementType:item.measurementType };
      finalScore += contribution;
    }
    return { breakdown, finalScore:Number(finalScore.toFixed(2)), provider:aiResult?.provider ?? "heuristic-fallback", model:aiResult?.model ?? null };
  }

  async calculateDailyForEmployee(employeeId: string, date = new Date()) {
    const template = await this.getTemplateForEmployee(employeeId);
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const evidence = await this.evidenceForPeriod(employeeId, day, new Date(day.getTime()+86399999));
    const scored = await this.scoreMetrics(template, evidence, "daily");
    return this.prisma.kRADailyScore.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      create: { employeeId, templateId: template.id, date: day, breakdown: scored.breakdown as any, evidence: evidence as any, finalScore: scored.finalScore, provider: scored.provider, model: scored.model },
      update: { templateId: template.id, breakdown: scored.breakdown as any, evidence: evidence as any, finalScore: scored.finalScore, provider: scored.provider, model: scored.model, calculatedAt:new Date() },
      include: { template: { include: { items: true } } },
    });
  }

  async syncMonthlyProjection(employeeId: string, month: number, year: number) {
    const template = await this.getTemplateForEmployee(employeeId);
    const daily = await this.dailyScores(employeeId, month, year);
    if (!daily.length) return null;
    const totals: Record<string, {sum:number; count:number}> = {};
    for (const row of daily) {
      const breakdown:any = row.breakdown || {};
      for (const item of template.items) {
        const value = breakdown[item.id]?.achievementPercent;
        if (value == null) continue;
        totals[item.id] ??= {sum:0,count:0};
        totals[item.id].sum += Number(value); totals[item.id].count += 1;
      }
    }
    const breakdown:any = {}; let finalScore = 0;
    for (const item of template.items) {
      const average = totals[item.id]?.count ? totals[item.id].sum / totals[item.id].count : 0;
      const weight = Number(item.weightPercent);
      const contribution = weight / 100 * average;
      breakdown[item.id] = { itemId:item.id, weight, achievementPercent:Number(average.toFixed(1)), contribution:Number(contribution.toFixed(2)), isAutomated:true, confidence:45, evidence:`Average of ${totals[item.id]?.count ?? 0} daily evidence snapshot(s).`, targetValue:item.targetValue == null ? null : Number(item.targetValue), targetText:item.targetText, measurementType:item.measurementType };
      finalScore += contribution;
    }
    return this.prisma.kRAScore.upsert({
      where:{employeeId_periodMonth_periodYear:{employeeId,periodMonth:month,periodYear:year}},
      create:{employeeId,templateId:template.id,periodMonth:month,periodYear:year,breakdown:breakdown as any,finalScore:Number(finalScore.toFixed(2)),isFinal:false},
      update:{templateId:template.id,breakdown:breakdown as any,finalScore:Number(finalScore.toFixed(2)),isFinal:false,calculatedAt:new Date()},
    });
  }

  async runDailyCalculation(date = new Date()) {
    const employees = await this.prisma.employee.findMany({ where: { employmentStatus: { not: "EXITED" }, deletedAt: null }, select: { id: true } });
    let calculated = 0;
    for (const employee of employees) { await this.calculateDailyForEmployee(employee.id, date); calculated++; }
    return { calculated, date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10) };
  }

  async dailyScores(employeeId: string, month: number, year: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    return this.prisma.kRADailyScore.findMany({ where: { employeeId, date: { gte:start, lte:end } }, orderBy:{date:"asc"}, include:{ template:{ select:{ id:true, name:true, roleName:true } } } });
  }

  async calculateForEmployee(employeeId: string, month: number, year: number) {
    const template = await this.getTemplateForEmployee(employeeId);
    if (!template.items.length) throw new BadRequestException("The employee's KRA template has no KPI items");
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const evidence = await this.evidenceForPeriod(employeeId, start, end);
    const scored = await this.scoreMetrics(template, evidence, "monthly");
    return this.prisma.kRAScore.upsert({
      where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
      create: { employeeId, templateId: template.id, periodMonth:month, periodYear:year, breakdown:scored.breakdown as any, finalScore:scored.finalScore },
      update: { templateId:template.id, breakdown:scored.breakdown as any, finalScore:scored.finalScore, calculatedAt:new Date(), isFinal:false },
      include: { template:{ include:{ items:true } } },
    });
  }

  async finalize(scoreId: string) { return this.prisma.kRAScore.update({ where: { id: scoreId }, data: { isFinal: true } }); }
  async myScores(employeeId: string) { return this.prisma.kRAScore.findMany({ where:{employeeId}, include:{template:true}, orderBy:[{periodYear:"desc"},{periodMonth:"desc"}] }); }

  async teamScores(managerId: string, month: number, year: number, roles: string[] = [], departmentId?: string) {
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const reports = await this.prisma.employee.findMany({ where:isHr ? { deletedAt:null, employmentStatus:{not:"EXITED"}, ...(departmentId ? {departmentId}:{}) } : {managerId,deletedAt:null}, select:{id:true} });
    return this.prisma.kRAScore.findMany({ where:{employeeId:{in:reports.map(r=>r.id)},periodMonth:month,periodYear:year}, include:{employee:{select:{id:true,firstName:true,lastName:true,employeeCode:true,department:true,designation:true}},template:true} });
  }

  async setManualScore(employeeId: string, itemNameOrId: string, month: number, year: number, score: number, actorId: string, roles: string[]) {
    if (score < 0 || score > 100) throw new BadRequestException("KRA achievement must be between 0 and 100");
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const target = await this.prisma.employee.findUnique({where:{id:employeeId},select:{managerId:true}});
    if (!target) throw new NotFoundException("Employee not found");
    if (!isHr && !(roles.includes(RoleName.MANAGER) && target.managerId === actorId)) throw new ForbiddenException("Managers can only score direct reports");
    const template = await this.getTemplateForEmployee(employeeId);
    const item = template.items.find(i => i.id === itemNameOrId || i.name === itemNameOrId);
    if (!item) throw new NotFoundException("KRA item not found in employee template");
    if (item.isAutomated) throw new ForbiddenException("Automated KRA metrics cannot be manually overridden");
    // Manual scoring remains supported only for HR-defined exceptions; generated templates default to automated evidence scoring.
    const scoreRow = await this.calculateForEmployee(employeeId, month, year);
    const breakdown:any = scoreRow.breakdown || {};
    const weight = Number(item.weightPercent);
    const previous = breakdown[item.id] || {};
    const newContribution = weight / 100 * score;
    breakdown[item.id] = { ...previous, itemId:item.id, weight, achievementPercent:score, contribution:Number(newContribution.toFixed(2)), isAutomated:false, manualScore:score };
const finalScore = (Object.values(breakdown) as any[]).reduce(
  (sum: number, x: any) => sum + Number(x.contribution || 0),
  0
);

return this.prisma.kRAScore.update({
  where: { id: scoreRow.id },
  data: {
    breakdown: breakdown as any,
    finalScore: Number(finalScore.toFixed(2)),
    isFinal: false,
  },
});
  }

  async configureTemplate(departmentId: string, designationId: string, roleName: string, roleProfile: string) {
    const org = await this.calendarService.getOrganization();
    const designation = await this.prisma.designation.findFirst({ where:{ id:designationId, departmentId, deletedAt:null, department:{organizationId:org.id,deletedAt:null} } });
    if (!designation) throw new BadRequestException("Designation must belong to the selected department");
    const generated = await this.generateTemplateMetrics(roleName, roleProfile);
    const existing = await this.prisma.kRATemplate.findFirst({ where:{ organizationId:org.id, departmentId, designationId, isActive:true }, orderBy:{updatedAt:"desc"} });
    return this.prisma.$transaction(async (tx) => {
      const template = existing
        ? await tx.kRATemplate.update({ where:{id:existing.id}, data:{roleName, name:`${roleName} KRA`, description:roleProfile, isActive:true} })
        : await tx.kRATemplate.create({ data:{organizationId:org.id,departmentId,designationId,roleName,name:`${roleName} KRA`,description:roleProfile,isActive:true} });
      await tx.kRAItem.deleteMany({ where:{templateId:template.id} });
      await tx.kRAItem.createMany({ data:generated.metrics.map((m:any)=>({templateId:template.id,name:m.name,description:m.description,weightPercent:Number(m.weightPercent),measurementType:m.measurementType,targetText:m.targetText,isAutomated:Boolean(m.isAutomated),sortOrder:Number(m.sortOrder ?? 0)})) });
      return tx.kRATemplate.findUniqueOrThrow({ where:{id:template.id}, include:{department:true,designation:true,items:{orderBy:{sortOrder:"asc"}}} });
    });
  }

  async generateTemplateMetrics(roleName: string, roleProfile: string) {
    const generated = await this.ai.generateMetrics(roleName, roleProfile);
    if (generated) return generated;
    return {
      provider: "heuristic-template",
      model: null,
      metrics: [
        { name:"Attendance & Reliability", description:"Working-day attendance and punctuality", weightPercent:15, measurementType:"PERCENTAGE", targetText:"Meet department attendance expectations", isAutomated:true, sortOrder:0 },
        { name:"Task Completion", description:"Assigned task completion and EOD evidence", weightPercent:25, measurementType:"PERCENTAGE", targetText:"Complete assigned work with evidence", isAutomated:true, sortOrder:1 },
        { name:"Deadline Adherence", description:"Tasks delivered within committed timelines", weightPercent:15, measurementType:"PERCENTAGE", targetText:"90–100% on-time delivery", isAutomated:true, sortOrder:2 },
        { name:"DPR Submission", description:"Daily progress reporting compliance", weightPercent:15, measurementType:"PERCENTAGE", targetText:"100% of expected working-day DPRs", isAutomated:true, sortOrder:3 },
        { name:"Quality & Accuracy", description:"Quality reflected in manager-reviewed DPR evidence", weightPercent:15, measurementType:"PERCENTAGE", targetText:"95%+ quality/accuracy", isAutomated:true, sortOrder:4 },
        { name:"Collaboration & Ownership", description:"Evidence of communication, coordination and ownership", weightPercent:15, measurementType:"PERCENTAGE", targetText:"Consistent proactive ownership", isAutomated:true, sortOrder:5 },
      ],
    };
  }
}
