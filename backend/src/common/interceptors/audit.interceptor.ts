import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { AUDIT_KEY, AuditMeta } from "../decorators/audit.decorator";
import { AuditService } from "../../audit/audit.service";

/**
 * Any controller method decorated with @Audit({ action, entityType }) gets its result
 * written to AuditLog automatically, capturing who did what to which entity.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap((result) => {
        const entityId = result?.id ?? request.params?.id ?? "unknown";
        this.auditService
          .record({
            userId: user?.userId,
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            after: result,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          })
          .catch(() => undefined);
      }),
    );
  }
}
