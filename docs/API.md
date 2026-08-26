# API Surface

Base path: `/api/v1`

All endpoints are authenticated unless marked public.

## Authentication

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## Core HRMS

- `/employees` — employee master, hierarchy, profile and lifecycle
- `/attendance` — check-in/out, monthly/team attendance, regularization
- `/workday` — daily state and history
- `/todos` — personal/team tasks, comments and bulk actions
- `/dpr` — draft, auto-fill, submit and manager review
- `/leave` — types, balances, requests, manager approval, HR final approval/reversal
- `/calendar` — organization working rules and holidays
- `/policies` — versioned policy publishing/acknowledgement
- `/documents` — role-scoped document storage
- `/notifications` — in-app notification feed/read state
- `/reports` — HR reports, pay-attendance, compliance and month-end XLSX

## KRA and monitoring

- `/kra` — employee/team KRA scores and manual dimensions
- `/strikes` — employee/HR strike views, resolution and PIP task creation
- `/group-monitor` — group registration, membership synchronization and checks

## ATS

- `/jobs/requisitions` — requisitions, approval and publishing
- `/jobs/careers` — public careers listing
- `/jobs/careers/:slug/apply` — public candidate application with resume upload
- `/candidates` — candidate pipeline, import, stage changes and activities
- `/interviews` — interview scheduling and scorecards
- `/offers` — offer creation/approval/send
- `/offers/portal/:token` — public offer response
- `/webhooks/email-inbound` — signed inbound email candidate intake

## Security expectations

Controllers use `@Roles()` plus relationship-aware service checks. Public careers/offer/webhook routes
perform their own token/signature validation. File endpoints enforce size/type constraints and the storage
adapter fails closed when object storage is not configured.
