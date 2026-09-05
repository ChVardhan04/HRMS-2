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
  evidenceSource?: string;
  evaluationMethod?: string;
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

  /**
   * A KRA score is the weighted sum of each metric's achievement, so the weights
   * MUST total exactly 100 for the score to be comparable against the strike
   * threshold.
   *
   * Previously only an upper bound was enforced. A template whose weights summed
   * to, say, 60% capped every employee's achievable score at 60% — permanently
   * below the default 80% threshold — which meant every employee was auto-struck
   * every month regardless of actual performance. Deleting an item silently
   * created exactly that state.
   */
  private static readonly WEIGHT_TOLERANCE = 0.01;

  private assertWeightsTotal100(weights: number[], context: string) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (Math.abs(total - 100) > KraService.WEIGHT_TOLERANCE) {
      throw new BadRequestException(
        `${context}: KRA metric weights must total exactly 100%. The current total is ${total.toFixed(2)}%. ` +
          `Adjust the other metrics so the template sums to 100% — otherwise the calculated score cannot reach 100% and the strike threshold would be unreachable.`,
      );
    }
    return Number(total.toFixed(2));
  }

  /** Reports weight health for a template so HR can see and fix a broken configuration. */
  async templateWeightSummary(templateId: string) {
    const template = await this.prisma.kRATemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new NotFoundException("KRA template not found");
    const totalWeight = template.items.reduce((sum, i) => sum + Number(i.weightPercent), 0);
    const balanced = Math.abs(totalWeight - 100) <= KraService.WEIGHT_TOLERANCE;
    return {
      templateId,
      itemCount: template.items.length,
      totalWeight: Number(totalWeight.toFixed(2)),
      balanced,
      usableForScoring: template.items.length > 0 && balanced,
      message: template.items.length === 0
        ? "This template has no metrics. Employees on it cannot be scored and must not be struck."
        : balanced
          ? "Weights total 100% — this template is ready for scoring."
          : `Weights total ${totalWeight.toFixed(2)}%. Scores will be normalised, but fix the weights so the configuration matches intent.`,
    };
  }

  async addItem(templateId: string, dto: KraItemDto) {
    const template = await this.prisma.kRATemplate.findUnique({ where: { id: templateId }, include: { items: true } });
    if (!template) throw new NotFoundException("KRA template not found");
    const weights = [...template.items.map((i) => Number(i.weightPercent)), dto.weightPercent];
    this.assertWeightsTotal100(weights, "Cannot add this metric");
    return this.prisma.kRAItem.create({ data: { templateId, ...dto } });
  }

  async updateItem(id: string, dto: Partial<KraItemDto>) {
    const item = await this.prisma.kRAItem.findUnique({ where: { id }, include: { template: { include: { items: true } } } });
    if (!item) throw new NotFoundException("KRA item not found");
    if (dto.weightPercent != null) {
      const weights = item.template.items.map((x) =>
        x.id === id ? dto.weightPercent! : Number(x.weightPercent),
      );
      this.assertWeightsTotal100(weights, "Cannot update this metric weight");
    }
    return this.prisma.kRAItem.update({ where: { id }, data: dto });
  }

  /**
   * Deleting an item leaves the remaining weights short of 100%, which would
   * silently make the template unscoreable. Callers must redistribute the freed
   * weight in the same request via `redistribute`, or delete the last item.
   */
  async deleteItem(id: string, redistribute?: Array<{ itemId: string; weightPercent: number }>) {
    const item = await this.prisma.kRAItem.findUnique({
      where: { id },
      include: { template: { include: { items: true } } },
    });
    if (!item) throw new NotFoundException("KRA item not found");

    const remaining = item.template.items.filter((x) => x.id !== id);

    if (!remaining.length) {
      return this.prisma.kRAItem.delete({ where: { id } });
    }

    const adjustments = new Map(
      (redistribute ?? []).map((r) => [r.itemId, Number(r.weightPercent)]),
    );
    const weights = remaining.map((x) =>
      adjustments.has(x.id) ? adjustments.get(x.id)! : Number(x.weightPercent),
    );
    this.assertWeightsTotal100(
      weights,
      "Cannot delete this metric without rebalancing the remaining weights",
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.kRAItem.delete({ where: { id } });
      for (const [itemId, weightPercent] of adjustments) {
        if (!remaining.some((x) => x.id === itemId)) continue;
        await tx.kRAItem.update({ where: { id: itemId }, data: { weightPercent } });
      }
      return tx.kRATemplate.findUniqueOrThrow({
        where: { id: item.templateId },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });
  }

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
    // A task can contribute to the period even when it was created earlier (for example, a monthly task completed this month).
    // Include tasks that were created, due, completed, or explicitly linked to a WorkDay inside the requested period.
    const todos = await this.prisma.todo.findMany({
      where: {
        assigneeId: employeeId,
        status: { not: "CANCELLED" },
        OR: [
          { createdAt: { gte: start, lte: end } },
          { dueDate: { gte: start, lte: end } },
          { completedAt: { gte: start, lte: end } },
          { workDay: { date: { gte: start, lte: end } } },
        ],
      },
      select: {
        id: true, title: true, description: true, project: true, priority: true,
        status: true, eodStatus: true, estimatedHours: true, actualHours: true,
        completedAt: true, completionOutputSummary: true,
        completionProofFileName: true, completionProofSubmittedAt: true,
        aiCompletionPercent: true, aiCompletionAnalysis: true, aiAnalyzedAt: true,
        dueDate: true, includedInDpr: true, createdAt: true,
      },
    });
    const todoComments = await this.prisma.todoComment.findMany({ where: { authorId: employeeId, createdAt: { gte: start, lte: end } }, select: { todoId: true, body: true, createdAt: true } });
    const dprs = await this.prisma.dPR.findMany({ where: { workDay: { employeeId, date: { gte: start, lte: end } } }, include: { entries: true }, orderBy: { createdAt: "asc" } });
    const atsActivities = await this.prisma.candidateActivity.findMany({ where: { performedById: employeeId, createdAt: { gte: start, lte: end } }, select: { id: true, candidateId: true, type: true, body: true, followUpDueAt: true, createdAt: true } });
    const leaves = await this.prisma.leaveRequest.findMany({ where: { employeeId, status: LeaveStatus.APPROVED, startDate: { lte: end }, endDate: { gte: start } }, include: { leaveType: true } });
    const expectedWorkingDays = await this.calendarService.countWorkingDaysForEmployee(employeeId, start, end);
    const present = workDays.filter(w => ["PRESENT", "LATE", "WORK_FROM_HOME"].includes(w.attendanceStatus)).length;
    const late = workDays.filter(w => w.isLate).length;
    const halfDay = workDays.filter(w => w.attendanceStatus === "HALF_DAY").length;
    const absent = workDays.filter(w => w.attendanceStatus === "ABSENT").length;
    const latePenaltyDays = workDays.reduce((s, w) => s + Number(w.latePenaltyDays ?? 0), 0);
    const effectiveWorkingDays = Math.max(0, present + halfDay * 0.5 - latePenaltyDays);
    const dprSubmitted = dprs.filter(d => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(d.status)).length;
    const completedTasks = todos.filter(t => t.eodStatus === "COMPLETED" || t.status === "COMPLETED").length;
    const dueTasks = todos.filter(t => t.dueDate != null);
    const onTimeTasks = dueTasks.filter(t => t.completedAt && new Date(t.completedAt).getTime() <= new Date(t.dueDate!).getTime()).length;
    const overdueCompletedTasks = dueTasks.filter(t => t.completedAt && new Date(t.completedAt).getTime() > new Date(t.dueDate!).getTime()).length;
    const analyzed = todos.filter(t => t.aiCompletionPercent != null);
    const aiTaskCompletion = analyzed.length ? analyzed.reduce((s,t)=>s+Number(t.aiCompletionPercent),0)/analyzed.length : null;
    const qualityRows = dprs.filter(d => d.qualityScore != null);
    const quality = qualityRows.length ? qualityRows.reduce((s,d)=>s+Number(d.qualityScore),0)/qualityRows.length : null;
    const totalHours = workDays.reduce((s,w)=>s+Number(w.workingHours ?? w.totalLoggedHours ?? 0),0);
    const taskOutputs = todos.filter(t => t.completionOutputSummary).map(t => ({ title:t.title, output:t.completionOutputSummary, completedAt:t.completedAt })).slice(0,200);
    const dprEntries = dprs.flatMap(d => d.entries.map(e => ({ date:d.createdAt, project:e.project, description:e.description, hours:e.hours, output:e.output, blocker:e.blocker, tomorrowPlan:e.tomorrowPlan }))).slice(0,300);
    const commentEvidence = todoComments.map(c => ({ todoId:c.todoId, body:c.body, createdAt:c.createdAt })).slice(0,200);
    const atsCounts = atsActivities.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {} as Record<string, number>);
    return {
      period: { start, end, expectedWorkingDays },
      employee: { id: employee.id, employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}`, department: employee.department?.name ?? null, designation: employee.designation?.title ?? null },
      attendance: { expectedWorkingDays, recordedWorkDays: workDays.length, present, late, halfDay, absent, latePenaltyDays: Number(latePenaltyDays.toFixed(2)), effectiveWorkingDays: Number(effectiveWorkingDays.toFixed(2)), totalHours: Number(totalHours.toFixed(2)), lateRecords: workDays.filter(w=>w.isLate).map(w=>({date:w.date, checkInAt:w.checkInAt, lateCountInMonth:w.lateCountInMonth, penaltyDays:w.latePenaltyDays})) },
      dpr: { expected: expectedWorkingDays, total: dprs.length, submitted: dprSubmitted, submissionRate: expectedWorkingDays ? Number((dprSubmitted / expectedWorkingDays * 100).toFixed(1)) : 100, qualityScoreOutOf10: quality },
      tasks: {
        total: todos.length,
        completed: completedTasks,
        completionRate: todos.length ? Number((completedTasks / todos.length * 100).toFixed(1)) : 0,
        dueCount: dueTasks.length,
        onTime: onTimeTasks,
        overdueCompleted: overdueCompletedTasks,
        deadlineRate: dueTasks.length ? Number((onTimeTasks / dueTasks.length * 100).toFixed(1)) : null,
        analyzedCount: analyzed.length,
        averageAiCompletionPercent: aiTaskCompletion == null ? null : Number(aiTaskCompletion.toFixed(1)),
        items: todos.slice(0,200).map(t => ({
          id:t.id, title:t.title, description:t.description, project:t.project, priority:t.priority,
          status:t.status, eodStatus:t.eodStatus, estimatedHours:t.estimatedHours, actualHours:t.actualHours,
          createdAt:t.createdAt, completedAt:t.completedAt, dueDate:t.dueDate,
          output:t.completionOutputSummary,
          proofFileName:t.completionProofFileName,
          proofSubmittedAt:t.completionProofSubmittedAt,
          aiCompletionPercent:t.aiCompletionPercent,
          aiCompletionAnalysis:t.aiCompletionAnalysis,
          aiAnalyzedAt:t.aiAnalyzedAt,
          includedInDpr:t.includedInDpr,
        })),
      },
      taskOutputs,
      comments: { count: commentEvidence.length, items: commentEvidence },
      dprEntries,
      atsActivity: { total: atsActivities.length, byType: atsCounts, items: atsActivities.slice(0,300) },
      leaves: leaves.map(l => ({ type:l.leaveType.name, start:l.startDate, end:l.endDate, days:l.numberOfDays })),
    };
  }

  private fallbackAchievement(item: any, evidence: any) {
    const key = item.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (key.includes("ATTENDANCE") || key.includes("RELIABILITY") || key.includes("PUNCTUAL")) {
      const denominator = evidence.attendance.expectedWorkingDays || 1;
      return Math.max(0, Math.min(100, (evidence.attendance.effectiveWorkingDays / denominator) * 100));
    }
    if (key.includes("DPR") || key.includes("DAILY_REPORT") || key.includes("REPORTING")) return evidence.dpr.expected ? (evidence.dpr.submitted / evidence.dpr.expected) * 100 : 100;
    if (key.includes("DEADLINE") || key.includes("ON_TIME")) return evidence.tasks.deadlineRate == null ? 0 : evidence.tasks.deadlineRate;
    if (key.includes("TASK") || key.includes("PRODUCTIVITY") || key.includes("COMPLETENESS")) return evidence.tasks.averageAiCompletionPercent != null ? evidence.tasks.averageAiCompletionPercent : evidence.tasks.completionRate;
    if (key.includes("QUALITY") || key.includes("ACCURACY") || key.includes("GUIDELINE") || key.includes("COMPLIANCE")) return evidence.dpr.qualityScoreOutOf10 == null ? (evidence.tasks.averageAiCompletionPercent ?? 50) : evidence.dpr.qualityScoreOutOf10 * 10;
    if (key.includes("LEAD") || key.includes("CALL") || key.includes("EMAIL") || key.includes("MEETING") || key.includes("CRM") || key.includes("OUTREACH")) return evidence.atsActivity.total ? 50 : 0;
    if (key.includes("COLLAB") || key.includes("COMMUNICATION") || key.includes("COORDINATION") || key.includes("OWNERSHIP") || key.includes("INITIATIVE") || key.includes("PROBLEM") || key.includes("RESOLUTION")) return evidence.comments.count || evidence.dprEntries.length ? 60 : 30;
    return evidence.tasks.total || evidence.dprEntries.length || evidence.atsActivity.total ? 50 : 0;
  }

  private metricPayload(template: any) {
    return template.items.map((item: any) => ({ itemId: item.id, name: item.name, description: item.description, weightPercent: Number(item.weightPercent), targetValue: item.targetValue == null ? null : Number(item.targetValue), targetText: item.targetText, unit: item.unit, measurementType: item.measurementType, isAutomated: true, evidenceSource: item.evidenceSource || "HRMS_ACTIVITY", evaluationMethod: item.evaluationMethod || "Evaluate only from recorded HRMS evidence; reduce confidence when evidence is missing." }));
  }

  private evidenceForMetric(metric: any, evidence: any) {
    const source = String(metric.evidenceSource || "HRMS_ACTIVITY").toUpperCase();
    const selected: any = { employee: evidence.employee, period: evidence.period };
    if (source.includes("ATTENDANCE") || source.includes("HRMS_ACTIVITY")) selected.attendance = evidence.attendance;
    if (source.includes("TASKS") || source.includes("TASK_AI") || source.includes("HRMS_ACTIVITY")) { selected.tasks = evidence.tasks; selected.taskOutputs = evidence.taskOutputs; }
    if (source.includes("DPR") || source.includes("HRMS_ACTIVITY")) { selected.dpr = evidence.dpr; selected.dprEntries = evidence.dprEntries; }
    if (source.includes("DPR_QUALITY")) selected.dprQuality = evidence.dpr.qualityScoreOutOf10;
    if (source.includes("COMMENTS")) selected.comments = evidence.comments;
    if (source.includes("ATS_ACTIVITY")) selected.atsActivity = evidence.atsActivity;
    if (source.includes("LEAVE") || source.includes("HRMS_ACTIVITY")) selected.leaves = evidence.leaves;
    return selected;
  }

  private async scoreMetrics(template: any, evidence: any, period: "daily" | "monthly") {
    const metrics = this.metricPayload(template).map((metric: any) => ({ ...metric, evidence: this.evidenceForMetric(metric, evidence) }));
    const aiResult = await this.ai.evaluate(metrics, evidence, period);
    const aiMap = new Map((aiResult?.results ?? []).map((r) => [r.itemId, r]));
    const breakdown: Record<string, KraBreakdownItem> = {};

    let weightedTotal = 0;
    let totalWeight = 0;

    for (const item of template.items) {
      const metric = metrics.find((m: any) => m.itemId === item.id);
      const ai = aiMap.get(item.id);
      const achievement = ai ? ai.achievementPercent : this.fallbackAchievement(item, evidence);
      const weight = Number(item.weightPercent);
      const contribution = (weight / 100) * achievement;

      breakdown[item.id] = {
        itemId: item.id,
        weight,
        achievementPercent: Number(achievement.toFixed(1)),
        contribution: Number(contribution.toFixed(2)),
        isAutomated: true,
        confidence: ai?.confidence ?? 45,
        evidence:
          ai?.evidence ??
          `Evidence source: ${item.evidenceSource || "HRMS_ACTIVITY"}. ${metric?.evaluationMethod || "Deterministic evidence calculation."}`,
        gaps:
          ai?.gaps ??
          (aiResult
            ? ""
            : "AI evaluation was unavailable; this metric used the deterministic keyword fallback, which does not read the metric's target or evaluation method."),
        evidenceSource: item.evidenceSource || "HRMS_ACTIVITY",
        evaluationMethod: item.evaluationMethod || metric?.evaluationMethod,
        targetValue: item.targetValue == null ? null : Number(item.targetValue),
        targetText: item.targetText,
        measurementType: item.measurementType,
      };

      weightedTotal += contribution;
      totalWeight += weight;
    }

    // Normalise against the actual total weight. If a template's weights do not
    // sum to 100 (legacy data created before the weight rule was enforced), the
    // raw weighted sum could never reach 100% and would trigger an unavoidable
    // strike. Normalising keeps the 0-100 scale meaningful; `weightsBalanced`
    // records that the configuration still needs fixing.
    const weightsBalanced =
      totalWeight > 0 && Math.abs(totalWeight - 100) <= KraService.WEIGHT_TOLERANCE;
    const finalScore =
      totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : 0;

    // A score is only trustworthy enough to drive a strike when the AI actually
    // evaluated the configured metrics against their targets. The keyword
    // fallback ignores targets, weights semantics and evaluation methods.
    const aiEvaluated = Boolean(aiResult);

    return {
      breakdown,
      finalScore: Number(finalScore.toFixed(2)),
      totalWeight: Number(totalWeight.toFixed(2)),
      weightsBalanced,
      aiEvaluated,
      metricCount: template.items.length,
      provider: aiResult?.provider ?? "heuristic-fallback",
      model: aiResult?.model ?? null,
    };
  }


  /**
   * Metadata recorded alongside every breakdown so downstream consumers — above
   * all the strike engine — can tell a genuine low score apart from a score that
   * is low only because the template or the AI evaluation was broken.
   */
  private scoreMeta(scored: any) {
    return {
      __meta: {
        metricCount: scored.metricCount,
        totalWeight: scored.totalWeight,
        weightsBalanced: scored.weightsBalanced,
        aiEvaluated: scored.aiEvaluated,
        provider: scored.provider,
        model: scored.model,
        // Only a fully-configured template evaluated by AI may drive a strike.
        eligibleForStrike:
          scored.metricCount > 0 && scored.weightsBalanced && scored.aiEvaluated,
        calculatedAt: new Date().toISOString(),
      },
    };
  }

  async calculateDailyForEmployee(employeeId: string, date = new Date()) {
    const template = await this.getTemplateForEmployee(employeeId);
    // A template with no metrics would score 0% and, left unguarded, would look
    // identical to genuine non-performance.
    if (!template.items.length) {
      throw new BadRequestException(
        `KRA template "${template.name ?? template.roleName}" has no metrics configured. Add metrics totalling 100% before scoring.`,
      );
    }
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const evidence = await this.evidenceForPeriod(employeeId, day, new Date(day.getTime()+86399999));
    const scored = await this.scoreMetrics(template, evidence, "daily");
    const breakdown = { ...scored.breakdown, ...this.scoreMeta(scored) };
    return this.prisma.kRADailyScore.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      create: { employeeId, templateId: template.id, date: day, breakdown: breakdown as any, evidence: evidence as any, finalScore: scored.finalScore, provider: scored.provider, model: scored.model },
      update: { templateId: template.id, breakdown: breakdown as any, evidence: evidence as any, finalScore: scored.finalScore, provider: scored.provider, model: scored.model, calculatedAt:new Date() },
      include: { template: { include: { items: true } } },
    });
  }

  async syncMonthlyProjection(employeeId: string, month: number, year: number) {
    // Never touch a month that has already been finalised. The daily projection
    // job and the month-end finalisation job share the same schedule slot, so
    // without this guard a late-running daily sweep would overwrite the
    // authoritative AI-calculated final score with an average of dailies AND
    // flip isFinal back to false after strikes had already been issued.
    const existingFinal = await this.prisma.kRAScore.findUnique({
      where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
      select: { isFinal: true },
    });
    if (existingFinal?.isFinal) return null;

    const template = await this.getTemplateForEmployee(employeeId);
    if (!template.items.length) return null;
    const daily = await this.dailyScores(employeeId, month, year);
    const relevantDaily = daily.filter((row:any) => row.templateId === template.id);
    if (!relevantDaily.length) return null;
    const totals: Record<string, {sum:number; count:number}> = {};
    for (const row of relevantDaily) {
      const breakdown:any = row.breakdown || {};
      for (const item of template.items) {
        const value = breakdown[item.id]?.achievementPercent;
        if (value == null) continue;
        totals[item.id] ??= {sum:0,count:0};
        totals[item.id].sum += Number(value); totals[item.id].count += 1;
      }
    }
    const breakdown:any = {};
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const item of template.items) {
      const average = totals[item.id]?.count ? totals[item.id].sum / totals[item.id].count : 0;
      const weight = Number(item.weightPercent);
      const contribution = weight / 100 * average;
      breakdown[item.id] = { itemId:item.id, weight, achievementPercent:Number(average.toFixed(1)), contribution:Number(contribution.toFixed(2)), isAutomated:true, confidence:45, evidence:`Average of ${totals[item.id]?.count ?? 0} daily evidence snapshot(s).`, evidenceSource:item.evidenceSource || "HRMS_ACTIVITY", evaluationMethod:item.evaluationMethod, targetValue:item.targetValue == null ? null : Number(item.targetValue), targetText:item.targetText, measurementType:item.measurementType };
      weightedTotal += contribution;
      totalWeight += weight;
    }
    const weightsBalanced = totalWeight > 0 && Math.abs(totalWeight - 100) <= KraService.WEIGHT_TOLERANCE;
    const finalScore = totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : 0;

    // A projection is an in-month estimate only. It must never be treated as
    // strike-eligible; only the month-end AI calculation is.
    breakdown.__meta = {
      metricCount: template.items.length,
      totalWeight: Number(totalWeight.toFixed(2)),
      weightsBalanced,
      aiEvaluated: false,
      provider: "daily-projection",
      eligibleForStrike: false,
      projection: true,
      calculatedAt: new Date().toISOString(),
    };

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
    return this.prisma.kRADailyScore.findMany({ where: { employeeId, date: { gte:start, lte:end } }, orderBy:{date:"asc"}, include:{ template:{ include:{ items:true } } } });
  }

  async calculateForEmployee(employeeId: string, month: number, year: number) {
    const template = await this.getTemplateForEmployee(employeeId);
    if (!template.items.length) throw new BadRequestException("The employee's KRA template has no KPI items");
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const evidence = await this.evidenceForPeriod(employeeId, start, end);
    const scored = await this.scoreMetrics(template, evidence, "monthly");

    // Preserve any HR/manager manual overrides already recorded for this period.
    // Previously a recalculation silently discarded them.
    const existing = await this.prisma.kRAScore.findUnique({
      where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
    });
    const previous: any = existing?.breakdown ?? {};
    const breakdown: any = { ...scored.breakdown };
    let weightedTotal = 0;
    let totalWeight = 0;

    for (const item of template.items) {
      const override = previous[item.id];
      if (override && override.isAutomated === false && override.manualScore != null) {
        const weight = Number(item.weightPercent);
        breakdown[item.id] = {
          ...breakdown[item.id],
          achievementPercent: Number(override.manualScore),
          contribution: Number(((weight / 100) * Number(override.manualScore)).toFixed(2)),
          isAutomated: false,
          manualScore: Number(override.manualScore),
        };
      }
      weightedTotal += Number(breakdown[item.id]?.contribution ?? 0);
      totalWeight += Number(item.weightPercent);
    }

    const finalScore = totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : 0;
    breakdown.__meta = this.scoreMeta(scored).__meta;

    return this.prisma.kRAScore.upsert({
      where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
      create: { employeeId, templateId: template.id, periodMonth:month, periodYear:year, breakdown:breakdown as any, finalScore:Number(finalScore.toFixed(2)) },
      update: { templateId:template.id, breakdown:breakdown as any, finalScore:Number(finalScore.toFixed(2)), calculatedAt:new Date() },
      include: { template:{ include:{ items:true } } },
    });
  }

  async finalize(scoreId: string) { return this.prisma.kRAScore.update({ where: { id: scoreId }, data: { isFinal: true } }); }
  async myScores(employeeId: string) { return this.prisma.kRAScore.findMany({ where:{employeeId}, include:{template:{include:{items:true}}}, orderBy:[{periodYear:"desc"},{periodMonth:"desc"}] }); }

  async teamScores(managerId: string, month: number, year: number, roles: string[] = [], departmentId?: string) {
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const reports = await this.prisma.employee.findMany({ where:isHr ? { deletedAt:null, employmentStatus:{not:"EXITED"}, ...(departmentId ? {departmentId}:{}) } : {managerId,deletedAt:null}, select:{id:true} });
    return this.prisma.kRAScore.findMany({ where:{employeeId:{in:reports.map(r=>r.id)},periodMonth:month,periodYear:year}, include:{employee:{select:{id:true,firstName:true,lastName:true,employeeCode:true,department:true,designation:true}},template:true} });
  }

  /**
   * HR/manager override for a single metric.
   *
   * Two bugs fixed here:
   *  1. it called calculateForEmployee() first, which recalculated everything and
   *     wiped any manual score already set on a *different* metric. The override
   *     is now applied to the stored score in place.
   *  2. the final score was recomputed by summing Object.values(breakdown),
   *     which now also contains the non-metric `__meta` key.
   */
  async setManualScore(employeeId: string, itemNameOrId: string, month: number, year: number, score: number, actorId: string, roles: string[]) {
    if (typeof score !== "number" || Number.isNaN(score) || score < 0 || score > 100) {
      throw new BadRequestException("KRA achievement must be a number between 0 and 100");
    }
    const isHr = roles.includes(RoleName.HR_ADMIN) || roles.includes(RoleName.SUPER_ADMIN);
    const target = await this.prisma.employee.findUnique({where:{id:employeeId},select:{managerId:true}});
    if (!target) throw new NotFoundException("Employee not found");
    if (!isHr && !(roles.includes(RoleName.MANAGER) && target.managerId === actorId)) throw new ForbiddenException("Managers can only score direct reports");

    const template = await this.getTemplateForEmployee(employeeId);
    const item = template.items.find(i => i.id === itemNameOrId || i.name === itemNameOrId);
    if (!item) throw new NotFoundException("KRA item not found in employee template");

    // Ensure a score row exists for the period without discarding existing data.
    let scoreRow = await this.prisma.kRAScore.findUnique({
      where: { employeeId_periodMonth_periodYear: { employeeId, periodMonth: month, periodYear: year } },
    });
    if (!scoreRow) {
      scoreRow = await this.calculateForEmployee(employeeId, month, year);
    }
    if (scoreRow.isFinal && !isHr) {
      throw new ForbiddenException("This period has been finalised. Only HR can adjust a finalised KRA score.");
    }

    const breakdown: any = { ...(scoreRow.breakdown as any) };
    const weight = Number(item.weightPercent);
    breakdown[item.id] = {
      ...(breakdown[item.id] ?? {}),
      itemId: item.id,
      weight,
      achievementPercent: score,
      contribution: Number(((weight / 100) * score).toFixed(2)),
      isAutomated: false,
      manualScore: score,
      overriddenBy: actorId,
      overriddenAt: new Date().toISOString(),
    };

    // Sum only real metric entries — never the __meta block.
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const templateItem of template.items) {
      weightedTotal += Number(breakdown[templateItem.id]?.contribution ?? 0);
      totalWeight += Number(templateItem.weightPercent);
    }
    const finalScore = totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : 0;

    if (breakdown.__meta) {
      breakdown.__meta = { ...breakdown.__meta, manuallyAdjusted: true };
    }

    return this.prisma.kRAScore.update({
      where: { id: scoreRow.id },
      data: { breakdown: breakdown as any, finalScore: Number(finalScore.toFixed(2)) },
    });
  }

  async configureTemplate(departmentId: string, designationId: string, roleName: string, roleProfile: string) {
    const org = await this.calendarService.getOrganization();
    const designation = await this.prisma.designation.findFirst({ where:{ id:designationId, departmentId, deletedAt:null, department:{organizationId:org.id,deletedAt:null} } });
    if (!designation) throw new BadRequestException("Designation must belong to the selected department");
    const generated = await this.generateTemplateMetrics(roleName, roleProfile);
    if (!generated.metrics?.length) {
      throw new BadRequestException("KRA metric generation returned no metrics. Check the AI configuration or define metrics manually.");
    }
    // Guarantee the stored template is scoreable before it replaces the previous one.
    this.assertWeightsTotal100(
      generated.metrics.map((m: any) => Number(m.weightPercent)),
      "Generated KRA template is invalid",
    );

    const existing = await this.prisma.kRATemplate.findFirst({ where:{ organizationId:org.id, departmentId, designationId, isActive:true }, orderBy:{updatedAt:"desc"} });
    return this.prisma.$transaction(async (tx) => {
      if (existing) await tx.kRATemplate.update({ where:{id:existing.id}, data:{isActive:false} });
      const template = await tx.kRATemplate.create({ data:{organizationId:org.id,departmentId,designationId,roleName,name:`${roleName} KRA`,description:roleProfile,isActive:true} });
      await tx.kRAItem.createMany({ data:generated.metrics.map((m:any)=>({templateId:template.id,name:m.name,description:m.description,weightPercent:Number(m.weightPercent),measurementType:m.measurementType,targetText:m.targetText,isAutomated:true,evidenceSource:String(m.evidenceSource || "HRMS_ACTIVITY"),evaluationMethod:String(m.evaluationMethod || "Evaluate only from recorded HRMS evidence; reduce confidence when evidence is missing."),sortOrder:Number(m.sortOrder ?? 0)})) });
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
        { name:"Attendance & Reliability", description:"Working-day attendance, punctuality and monthly late deductions", weightPercent:15, measurementType:"PERCENTAGE", targetText:"Meet department attendance expectations", isAutomated:true, evidenceSource:"ATTENDANCE", evaluationMethod:"Use expected working days, effective working days after approved late penalties, late count and attendance status.", sortOrder:0 },
        { name:"Task Completion", description:"Assigned task completion and EOD evidence", weightPercent:25, measurementType:"PERCENTAGE", targetText:"Complete assigned work with evidence", isAutomated:true, evidenceSource:"TASKS|TASK_AI", evaluationMethod:"Compare completed tasks and AI completion evidence with assigned tasks; use output/proof and EOD status where available.", sortOrder:1 },
        { name:"Deadline Adherence", description:"Tasks delivered within committed timelines", weightPercent:15, measurementType:"PERCENTAGE", targetText:"90–100% on-time delivery", isAutomated:true, evidenceSource:"TASKS", evaluationMethod:"Calculate completed tasks finished at or before their recorded due date; do not infer missing due dates.", sortOrder:2 },
        { name:"DPR Submission", description:"Daily progress reporting compliance", weightPercent:15, measurementType:"PERCENTAGE", targetText:"100% of expected working-day DPRs", isAutomated:true, evidenceSource:"DPR", evaluationMethod:"Compare submitted DPRs with department-specific expected working days in the period.", sortOrder:3 },
        { name:"Quality & Accuracy", description:"Quality reflected in manager-reviewed DPR evidence and task analysis", weightPercent:15, measurementType:"PERCENTAGE", targetText:"95%+ quality/accuracy", isAutomated:true, evidenceSource:"DPR_QUALITY|TASK_AI", evaluationMethod:"Use manager DPR quality scores and task AI completion/output evidence; reduce confidence where manager review is missing.", sortOrder:4 },
        { name:"Collaboration & Ownership", description:"Evidence of communication, coordination and ownership", weightPercent:15, measurementType:"PERCENTAGE", targetText:"Consistent proactive ownership", isAutomated:true, evidenceSource:"COMMENTS|DPR|TASKS", evaluationMethod:"Use documented task comments, DPR descriptions/outputs/blockers and completion evidence; never infer interpersonal behavior without records.", sortOrder:5 },
      ],
    };
  }
}
