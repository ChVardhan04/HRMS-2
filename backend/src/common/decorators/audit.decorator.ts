import { SetMetadata } from "@nestjs/common";

export const AUDIT_KEY = "auditAction";
export interface AuditMeta {
  action: string;
  entityType: string;
}
/** Marks a controller method as a sensitive action that must be recorded in AuditLog. */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
