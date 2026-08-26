# HRMS + ATS Architecture

## 1. Source of truth

The implementation follows the supplied Production Plan. Its central design rule is that
`WorkDay` is the join entity connecting Attendance, To-Dos and DPR rather than treating them as
independent silos. This also feeds KRA and reporting.

## 2. Stack

- Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, shadcn-style UI primitives,
  TanStack Query, React Hook Form/Zod, PWA service worker.
- Backend: NestJS + TypeScript REST API.
- Data: PostgreSQL + Prisma.
- Async: Redis + BullMQ + scheduled sweeps.
- Storage: S3-compatible adapter; MinIO for local development, AWS S3/R2-compatible endpoints in production.
- Security: JWT access/refresh authentication, bcrypt, global RBAC, ownership/relationship checks,
  DTO validation, Helmet, CORS, throttling, audit interception.

## 3. Module boundaries

```text
Auth / Users / RBAC
        |
Employee Master ---- Company Calendar
        |
        +---- Attendance ----+
        |                     |
        +---- To-Dos --------> WorkDay <-------- Leave
        |                     |
        +---- DPR ------------+
                              |
                         KRA / 3-Strike

ATS ---- Group Monitor ---- Notifications / Reports / Audit
```

`CalendarService` is the centralized business-day authority. Attendance, Leave, WorkDay,
DPR scheduling, KRA and Reports use organization calendar settings rather than maintaining
separate weekend/holiday rules.

## 4. WorkDay synchronization

The intended employee flow is:

```text
Employee login
  -> Check-in
  -> WorkDay created atomically
  -> tasks assigned/created
  -> task completion
  -> DPR auto-fill
  -> DPR submission
  -> manager review
  -> KRA metrics
  -> strike evaluation
```

DPR submission is blocked without attendance. Completed tasks and DPR hours are reconciled before
submission. Leave approval updates the WorkDay status for working dates.

## 5. Authorization model

Roles in the schema are:

- EMPLOYEE
- MANAGER
- HR_ADMIN
- HIRING_MANAGER
- FINANCE
- LEADERSHIP
- SUPER_ADMIN

The UI hides role-inappropriate navigation, but backend guards remain authoritative. Relationship
checks additionally restrict direct-report resources, candidate ownership, task access, DPR access,
regularization, KRA scoring and salary/pay data.

## 6. Scheduled processing

The scheduled-jobs worker dispatches feature-owned schedulers for:

- auto-absence checks
- DPR reminders and SLA escalation
- stale ATS candidate detection
- Group Monitor reminders
- KRA pre-calculation/finalization and strike evaluation
- monthly leave accrual
- queued notifications

All attendance/DPR timing is evaluated in the organization timezone.

## 7. External integrations

External job-board and email/storage integrations are adapter-based. Missing credentials must not
be represented as successful production integrations. CSV import and the built-in careers page are
available without external job-board credentials. Google Calendar is represented as an integration
configuration point; interview scheduling itself is implemented, but provider synchronization is
not falsely claimed as complete.

## 8. Production deployment

Production infrastructure should provide TLS termination, managed PostgreSQL backups/restore,
Redis monitoring, S3-compatible storage, SMTP/email delivery, error monitoring and a staging
environment. Those are deployment concerns and are intentionally not fabricated inside application
code.
