# Database and Migration Guide

## Database

PostgreSQL is the system of record. Prisma models cover organization, employees, attendance/workday,
To-Dos, DPR, leave, policies/documents, ATS, Group Monitor, KRA/strikes, notifications and audit data.

## Migration history

1. `202608220000_baseline` — initial production-aligned schema.
2. `202608220001_hrms_calendar_payroll_policy` — calendar, salary/pay attendance fields, WFH and policy tables.
3. `202608220002_production_hardening` — centralized absence/DPR/KRA settings, tenant-owned leave types,
   policy acknowledgement version, secure offer portal token, accrual idempotency and leadership requisition approval.

The production-hardening migration intentionally adds only the leadership requisition approval field because
HR and Finance approval columns already exist in the baseline migration.

## Fresh database

```bash
cp .env.example .env
npm install
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend
npm run prisma:seed --workspace backend
```

For local development, `prisma migrate dev` may be used instead of `migrate deploy` when creating new migrations.

## Existing database

Always back up production first. Run:

```bash
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend
```

Do not manually delete production data to make a migration pass. The hardening migration includes the necessary
backfill for organization ownership of existing leave types and portal tokens for existing offers.

## Seed behavior

The seed creates roles, a demo organization, departments/designations, leave types, a default KRA template,
three demo accounts, holidays, employee balances, a working-day demo WorkDay, repeatable demo tasks and an
attendance policy. Demo task creation is idempotent and the demo WorkDay is selected from a real working day.

The seed reads `SEED_DEMO_PASSWORD` from `.env`; no demo password is hardcoded in source. Use a unique development value and never reuse it in production.
