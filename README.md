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

## AI provider

KRA evaluation and task-completion analysis use a provider abstraction. Configure one provider in `backend/.env`:

- `AI_PROVIDER=openai` with `OPENAI_API_KEY`
- `AI_PROVIDER=gemini` with `GEMINI_API_KEY`
- `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`
- `AI_PROVIDER=openai-compatible` with `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL`

Switching providers does not require frontend or database changes. Restart the backend after changing the provider.

If the configured AI provider is unavailable, the HRMS records a deterministic fallback for non-strike calculations. A monthly KRA score is not eligible to trigger a performance strike unless the configured AI evaluation succeeds and the KRA commitments/configuration are valid. See `docs/AI_PROVIDER_SETUP.md`.

## Result-driven KRA

HR explicitly configures result-driven KRA metrics for every designation; no generic/default KRA is automatically assigned. Employees create monthly commitments aligned to their saved designation metrics and update completion/results by the last calendar day of the month. The commitment period then locks. On the 7th of each month, the previous month's final KRA is calculated from designation expectations, aligned employee commitments/results and recorded HRMS evidence. See `docs/KRA_RESULT_DRIVEN_WORKFLOW.md`.

## File storage

When S3-compatible storage credentials are present, the normal S3 adapter is used. Without them, local development storage is used automatically under `backend/uploads/`. Do not commit uploaded files.

## Main documentation

- `docs/FINAL_EOD_TASK_AI_ATS_FLOW.md`
- `docs/BUSINESS_RULES.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/TESTING.md`
- `docs/PRODUCTION_CHECKLIST.md`
