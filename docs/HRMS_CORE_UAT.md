# HRMS Core UAT Flow

ATS is intentionally excluded from this test pass. Phase 0 and Phase 1 HRMS workflows are the current scope.

## Demo users

- HR: `hr.admin@hrms.local`
- Manager: `manager@hrms.local`
- Employee: `employee@hrms.local`
- Demo password: value configured in `.env` as `SEED_DEMO_PASSWORD`

## Who does what

### HR Admin

- Add employees from **Employees → Add employee**.
- Edit employee master records from **Employees → employee → Edit employee**.
- Set employment type: Full time, Part time, Contract, Intern.
- Set lifecycle status: Probation, Confirmed, Notice period, Exited.
- Assign department, designation, reporting manager and location.
- View company-wide attendance and DPR compliance.
- Give final approval for leave after manager approval.

### Manager

- Check in as themselves.
- See direct-report attendance.
- Assign team To-Dos to direct reports.
- Create personal To-Dos for themselves.
- Review team DPRs.
- Approve or reject leave requests from direct reports.

### Employee

- Open **Profile** to update personal contact information.
- Check in to unlock the daily To-Do flow.
- Create personal To-Dos.
- Complete To-Dos and report actual hours.
- Submit DPR from the synced WorkDay.
- Apply for leave.

## Leave flow

`Employee → Reporting Manager → HR final approval`

For the demo employee, the reporting manager is the demo Manager. HR does not receive the initial request directly unless the employee has no reporting manager. In that case the request is surfaced to HR for review.

## To-Do flow

`Check-in → To-Do list → Complete task → DPR auto-fill`

Personal To-Dos are available to every employee after check-in. Team assignment is a manager capability and is limited to direct reports.

## Employee master

The production plan defines the Employee Master as the foundation for attendance, leave, DPR and KRA. The core implementation therefore keeps these fields editable by HR/Admin:

- Name and phone
- Date of joining
- Employment type
- Employment status / lifecycle
- Department
- Designation
- Reporting manager
- Location

ATS, Group Monitor and KRA/Strike navigation is intentionally hidden during this HRMS-first UAT pass. They remain in the codebase for the later phase.

## Company Calendar & HR Reporting UAT

1. HR opens Company Calendar and verifies Asia/Kolkata, 09:30-19:00 office hours, 13:30-14:00 lunch, and 1st/3rd Saturday working policy.
2. HR adds a company holiday and verifies the date is excluded from working-day totals.
3. HR checks a 2nd/4th Saturday and verifies it is a non-working day.
4. Employee cannot check in on a company holiday/non-working Saturday.
5. Employee checking in after 09:30 is marked late.
6. HR opens HR Reports and verifies working days are based on the company calendar.
7. HR verifies employee rows show present, WFH, paid leave, unpaid leave, half-day, absent, late, working hours and payable days.
8. If monthly salary is configured, the report calculates an attendance-based payable amount. This is a reporting aid, not statutory payroll.
9. HR publishes a policy, optionally attaches a document, and an employee can acknowledge it.
