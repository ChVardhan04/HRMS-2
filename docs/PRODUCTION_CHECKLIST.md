# Production Checklist

## Application

- [x] Next.js PWA frontend with role-aware navigation and responsive UX.
- [x] NestJS REST API with DTO validation and centralized exception handling.
- [x] PostgreSQL/Prisma schema and ordered migrations.
- [x] Redis/BullMQ scheduled processing.
- [x] S3-compatible storage abstraction.
- [x] Attendance/WorkDay/To-Do/DPR synchronization.
- [x] Leave approval chain and balance reconciliation.
- [x] ATS, careers page, candidate pipeline, interviews and tokenized offers.
- [x] Group Monitor, KRA, three-strike and month-end XLSX report.

## Security

- [x] JWT access/refresh authentication.
- [x] bcrypt password hashing.
- [x] Backend RBAC plus relationship/ownership checks.
- [x] Helmet and configurable CORS.
- [x] Global request throttling.
- [x] DTO whitelist/forbid-non-whitelisted validation.
- [x] File size/type validation and fail-closed object storage.
- [x] Audit interception for important mutations.
- [x] No real secrets committed; `.env.example` contains placeholders.
- [ ] Enable TLS at the production reverse proxy/load balancer.
- [ ] Configure database encryption/managed encryption at rest.
- [ ] Define and enforce organization data-retention/legal policy.
- [ ] Complete GPS/liveness consent flow before enabling regulated location capture.

## Operations

- [x] CI workflow uses the root workspace lockfile and verifies generate/migrate/lint/build/test.
- [x] Docker compose includes PostgreSQL, Redis and MinIO plus application services.
- [ ] Configure production SMTP/email delivery.
- [ ] Configure production S3/R2 storage.
- [ ] Configure error monitoring (Sentry or equivalent).
- [ ] Configure database backups and perform a restore drill.
- [ ] Provision staging with production-like services.
- [ ] Add queue/job alerting dashboard in the production environment.

## External integrations

- [x] Adapter contracts and env-gated configuration exist for job boards.
- [x] CSV import and built-in careers page work without job-board credentials.
- [ ] Configure real Naukri/Indeed/LinkedIn credentials if required.
- [ ] Configure Google Calendar provider synchronization if required.
- [ ] Configure Jira/GitHub/CRM integrations for future automation phases.

## Business sign-off

- [ ] HR validates leave types, accruals and delegation policy.
- [ ] Leadership approves KRA weights and three-strike thresholds.
- [ ] Legal/HR approves offer-letter templates and document retention.
- [ ] Finance approves attendance-based pay calculation policy (not statutory payroll).
