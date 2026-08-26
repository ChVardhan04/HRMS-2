import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleName } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Enforces RBAC server-side. Frontend hides UI for convenience only — this guard is the
 * actual authorization boundary, applied globally in AppModule.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.roles) return false;

    // SUPER_ADMIN implicitly has access to everything.
    if (user.roles.includes(RoleName.SUPER_ADMIN)) return true;

    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
