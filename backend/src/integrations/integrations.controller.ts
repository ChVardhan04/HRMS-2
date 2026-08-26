import { Controller, Get } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RoleName } from "@prisma/client";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Roles(RoleName.SUPER_ADMIN, RoleName.HR_ADMIN)
  @Get("status")
  status() {
    return this.integrationsService.status();
  }
}
