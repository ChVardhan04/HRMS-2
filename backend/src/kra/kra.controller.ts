import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { KraService } from "./kra.service";
import { CreateKraTemplateDto, KraItemDto, GenerateKraMetricsDto, ConfigureKraTemplateDto, DeleteKraItemDto } from "./dto/kra.dto";

@Controller("kra")
export class KraController {
  constructor(private kraService: KraService) {}

  @Get("me") mine(@CurrentUser() user: AuthenticatedUser) { return this.kraService.myScores(user.employeeId!); }
  @Get("my-template") myTemplate(@CurrentUser() user: AuthenticatedUser) { return this.kraService.getTemplateForEmployee(user.employeeId!); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("employee/:employeeId/template") employeeTemplate(@Param("employeeId") employeeId: string) { return this.kraService.getTemplateForEmployee(employeeId); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("team")
  team(@CurrentUser() user: AuthenticatedUser, @Query("month") month: string, @Query("year") year: string, @Query("departmentId") departmentId?: string) {
    const now = new Date();
    return this.kraService.teamScores(user.employeeId!, Number(month) || now.getMonth()+1, Number(year) || now.getFullYear(), user.roles, departmentId);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("templates/configure")
  configureTemplate(@Body() dto: ConfigureKraTemplateDto) { return this.kraService.configureTemplate(dto.departmentId, dto.designationId, dto.roleName, dto.roleProfile); }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("generate-metrics")
  generateMetrics(@Body() dto: GenerateKraMetricsDto) { return this.kraService.generateTemplateMetrics(dto.roleName, dto.roleProfile); }

  @Get("daily/me")
  dailyMe(@CurrentUser() user: AuthenticatedUser, @Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.kraService.dailyScores(user.employeeId!, Number(month) || now.getMonth()+1, Number(year) || now.getFullYear());
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("daily/:employeeId")
  daily(@Param("employeeId") employeeId: string, @Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.kraService.dailyScores(employeeId, Number(month) || now.getMonth()+1, Number(year) || now.getFullYear());
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("templates") templates(@Query("departmentId") departmentId?: string) { return this.kraService.listTemplates(departmentId); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("templates") createTemplate(@Body() dto: CreateKraTemplateDto) { return this.kraService.createTemplate(dto); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("templates/:id") updateTemplate(@Param("id") id: string, @Body() dto: Partial<CreateKraTemplateDto>) { return this.kraService.updateTemplate(id, dto); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("templates/:id/items") addItem(@Param("id") id: string, @Body() dto: KraItemDto) { return this.kraService.addItem(id, dto); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("items/:id") updateItem(@Param("id") id: string, @Body() dto: Partial<KraItemDto>) { return this.kraService.updateItem(id, dto); }
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Delete("items/:id") deleteItem(@Param("id") id: string, @Body() dto: DeleteKraItemDto) { return this.kraService.deleteItem(id, dto?.redistribute); }

  /** Lets HR see whether a template's weights total 100% before relying on its scores. */
  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Get("templates/:id/weight-summary") weightSummary(@Param("id") id: string) { return this.kraService.templateWeightSummary(id); }

  @Roles(RoleName.MANAGER, RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("employee/:employeeId/manual-score")
  manualScore(@CurrentUser() user: AuthenticatedUser, @Param("employeeId") employeeId: string, @Body("itemName") itemName: string, @Body("month") month: number, @Body("year") year: number, @Body("score") score: number) {
    return this.kraService.setManualScore(employeeId, itemName, month, year, score, user.employeeId!, user.roles);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("employee/:employeeId/recalculate") recalculate(@Param("employeeId") employeeId: string, @Body("month") month: number, @Body("year") year: number) { return this.kraService.calculateForEmployee(employeeId, month, year); }
}
