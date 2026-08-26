# HRMS Real-World Alignment — Webisdom Rules + Production Plan

This implementation keeps the HRMS as the primary product and treats ATS, Group Monitor and KRA as later-phase modules rather than deleting them.

## Reference model

The workflow was aligned against the supplied HRMS Production Plan and common HRMS patterns found in established products such as OrangeHRM, BambooHR and Zoho People.

Common patterns used here:
- Employee master is the source of ownership and lifecycle data.
- HR controls company calendar, holidays, policies and employee master.
- Employees own their attendance, tasks, DPR and leave requests.
- Managers own team task assignment, DPR review and first-level leave approval.
- HR monitors attendance/DPR compliance and performs HR administration/final leave processing.
- Attendance reporting uses the organization's working calendar rather than assuming Monday-Friday only.
- Pay-attendance reporting separates working days, presence, paid leave, unpaid leave, WFH, half-days and absences.
- WorkDay remains the synchronization hub for attendance, To-Dos and DPR.

## Webisdom working rules configured as defaults

- Time zone: Asia/Kolkata
- Monday-Friday: working
- 1st and 3rd Saturday: working
- 2nd and 4th Saturday: off
- 5th Saturday: off by default; HR can change the Saturday policy
- Sunday: off
- Office: 09:30-19:00
- Lunch: 13:30-14:00
- Check-in after 09:30 is late unless HR configures a grace period
- Attendance call: 09:15-09:30 is an operational reminder, not a second attendance record

## Core flows

### Attendance
Company Calendar -> determine working/non-working day -> WorkDay -> check-in/out -> attendance status -> HR reports.

### To-Do / DPR
Check-in -> personal/manager-assigned To-Dos -> completion -> DPR auto-fill -> employee submission -> manager/TL review.

HR does not approve every DPR. HR monitors compliance and may later rate DPR completeness for KRA.

### Leave
Employee applies -> reporting manager approves/rejects -> HR final administration/approval -> approved leave reconciles to WorkDay. Weekends and company holidays are not counted as leave days.

WFH is represented as a working-day attendance state rather than a normal absence.

### Employee lifecycle
HR creates and edits employees with employment type, joining date, department, designation, reporting manager, lifecycle status and optional monthly salary/payroll eligibility.

### HR calendar
HR can configure company working rules and maintain company/optional holidays. Calendar summary is used by attendance and reports.

### HR reports
The pay-attendance report is an attendance calculation/reporting aid, not a complete statutory payroll engine. Payroll formulas can be extended later for company-specific deductions, overtime, LOP policy, tax and statutory rules.

## Phase delivery

### Current HRMS-first implementation
- Employee master and lifecycle
- Company calendar and working-day engine
- Attendance with Web/PWA flow
- To-Do + DPR sync
- Leave workflow
- HR attendance/DPR/leave monitoring
- Working-day and pay-attendance report
- Policy library and employee acknowledgement

### Later phases
- Full KRA/3-strike UI and month-end automation
- Group Monitor
- ATS integrations and hiring workflows
- Biometric import
- Slack/Teams/SMS integrations
- Advanced payroll/statutory processing

## Production notes

The repository includes an incremental Prisma migration for the new calendar, WFH, salary/reporting and policy fields. Run Prisma generation and migrations against the target PostgreSQL database before starting the API after pulling these changes.
