# Business Rules

## Company calendar

- Organization timezone is authoritative.
- Default office hours: 09:30–19:00.
- Default lunch: 13:30–14:00.
- Attendance call: 09:15–09:30.
- Default working Saturdays: 1st and 3rd.
- Default non-working Saturdays: 2nd and 4th.
- Sundays are non-working.
- Non-optional holidays override the normal weekday/Saturday pattern.
- Calendar settings are configurable and consumed by dependent modules.

## Attendance

- Check-in creates/updates the employee's WorkDay atomically.
- Duplicate check-in/check-out attempts are rejected safely.
- Working hours are calculated using the organization lunch window.
- Auto-absence runs on a timezone-aware cutoff.
- Regularization is requested by the employee and normally approved by the reporting manager;
  HR/SUPER_ADMIN can handle administrative exceptions.
- Attendance history and monthly views are relationship-scoped.

## To-Dos

- Employees can create personal tasks only after checking in for the workday.
- Managers can assign tasks to their direct reports without needing their own check-in.
- Task completion is tied to the assignee's WorkDay and feeds DPR.
- Users cannot bulk-update tasks outside their authorized scope.

## DPR

- Attendance is a hard prerequisite for submission.
- Completed tasks must be represented in the DPR.
- DPR hours must reconcile with completed-task hours before submission.
- Only the employee, their reporting manager, or HR can access the DPR review record.
- Manager/TL is the business approver. HR performs compliance/quality oversight rather than replacing
  manager approval.
- Reminders and escalation use organization-configured windows and are idempotent.

## Leave

- Approval chain: Employee -> Reporting Manager -> HR final processing.
- Working-day counts exclude weekends, non-working Saturdays and company holidays.
- Cross-year requests are calculated separately per calendar year.
- Overlapping active leave requests are blocked.
- Paid leave consumes the corresponding yearly balance.
- Approval synchronizes Attendance/WorkDay; HR can reverse an approved request and restore balance.
- Monthly accrual uses `lastAccruedAt` to avoid duplicate accrual runs.

## KRA and three-strike

The default developer-style scoring model follows the supplied plan:

- DPR submission: 20%
- Task completion: 30%
- Attendance: 20%
- DPR quality: 15%
- Collaboration: 15% manual

Automated dimensions are calculated from calendar-aware working dates. Approved leave does not create
an artificial DPR non-compliance day. Manual dimensions persist in the KRA breakdown and automated
metrics cannot be overridden manually.

Default strike policy is configurable:

- monthly score below 80% -> strike
- rolling 6-month window
- 3 strikes -> escalation

The HR dashboard presents 0/1/2/3+ strike risk levels and PIP task creation is scoped to the employee.

## ATS

- Candidate duplicate detection reuses the existing candidate and upserts the job application.
- Candidate access for hiring managers is scoped to their requisitions.
- Rejections require a reason.
- Requisition approval records HR plus Finance/Leadership approval before opening.
- Published requisitions are exposed through the built-in public careers pages.
- Interview scheduling requires future time and active panelists.
- Only assigned panelists can submit one scorecard each.
- Offers use an unguessable portal token rather than predictable identifiers.
- Accepted offers move candidates to JOINED and create employee access when appropriate.

## Salary/pay attendance

Pay-attendance calculations are intentionally not statutory payroll. Salary fields are HR/SUPER_ADMIN
restricted and the calculation is based on configured working days, paid leave, unpaid leave and
half-days.

## Final EOD task evidence workflow

- A working-day task must be resolved before employee checkout.
- COMPLETED requires screenshot proof, actual hours and an output/completion summary.
- INCOMPLETE requires actual hours and a valid reason.
- The task's EOD state is stored separately from its workflow status so unresolved work cannot be hidden by simply changing task status.
- DPR submission triggers task-completion analysis using the assigned task and DPR text.
- KRA TASK_COMPLETION uses stored AI completion percentages when available.
- Checkout is blocked until all tasks are resolved and the DPR is submitted.

## Final ATS workflow

- HR selects an open job before screening a resume.
- Resume text is extracted from PDF/DOCX.
- Candidate is created or reused by email and linked to the selected job.
- JD-specific ATS score is stored per candidate/job application.
- ATS score is a decision-support signal; HR remains responsible for screening decisions.
