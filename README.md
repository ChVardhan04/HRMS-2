# HRMS

This build follows the agreed HR-owned operating model and the production plan. HR is the single operational owner of employee administration and recruitment. Managers own team task assignment/DPR review/leave approval. Employees own daily work, task evidence, DPR and leave self-service. Finance and Hiring Manager are not active operational roles in this build.

## Final daily employee flow

Check in -> WorkDay -> To-Dos -> EOD task resolution -> DPR review/submission -> AI task-completion analysis -> Checkout.

### EOD task resolution
- Completed task: hours + completion summary + screenshot proof are required.
- Incomplete task: hours + a valid reason are required.
- Checkout is blocked while any non-cancelled task remains unresolved.
- Checkout is also blocked until today's DPR is submitted.
- On DPR submission, the task AI compares each assigned task with the submitted DPR text and stores a completion percentage and analysis.
- KRA TASK_COMPLETION uses those AI completion percentages when available.

## Final ATS flow

Select Job -> Upload Resume -> Parse Resume -> Create/Reuse Candidate -> Attach Candidate to Job -> Calculate JD-specific ATS Score -> Save Screening Result -> Candidate enters RESUME_SCREEN -> Candidate appears in ATS pipeline.

Public careers applications are also automatically screened against the exact job after submission.

## Local setup

Requirements: Node 20+, PostgreSQL and optionally Redis.



1. From the repository root run `npm install`.
2. Run `cd backend && npx prisma generate`.
3. For a fresh local database run `npx prisma migrate deploy` followed by `npx prisma db seed`.
4. Start the app with `npm run dev`.

## AI task analysis

Set `OPENAI_API_KEY` to enable the real AI task-completion analyst. `AI_MODEL` defaults to `gpt-4.1-mini`.

If the AI provider is unavailable, the HRMS uses a deterministic fallback and records `provider: heuristic-fallback` in the task analysis. This is a reliability fallback, not a claim of equivalent AI quality.

## File storage

When S3-compatible storage credentials are present, the normal S3 adapter is used. Without them, local development storage is used automatically under `backend/uploads/`. Do not commit uploaded files.

## Main documentation

- `docs/FINAL_EOD_TASK_AI_ATS_FLOW.md`
- `docs/BUSINESS_RULES.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/TESTING.md`
- `docs/PRODUCTION_CHECKLIST.md`
