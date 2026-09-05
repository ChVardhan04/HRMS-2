# KRA AI Implementation

## Operating model

HR defines the role context once for a Department + Designation. The system stores a KRA template with measurable metrics, targets, weights, evidence sources and evaluation guidance. Employees are not expected to manually calculate KRA scores.

## Evidence collected

- Department-specific working calendar and expected working days
- Attendance status, check-in time, late count and late-penalty days
- Worked hours and effective working days
- Assigned tasks, status, EOD status, due dates and completion time
- Task completion output and proof metadata
- Existing task AI completion analysis
- DPR submission status and DPR entries
- Manager-reviewed DPR quality score
- Task comments written by the employee
- Approved leave
- ATS/candidate activities performed by the employee, when available in HRMS

## Metric evaluation

Each metric stores `evidenceSource` and `evaluationMethod`. The AI receives the metric definition, target, weight and only the relevant recorded HRMS evidence. It returns an achievement percentage, confidence, supporting evidence and gaps. The weighted contribution is `weight / 100 * achievementPercent` and the final KRA score is the sum of all contributions.

The AI is explicitly prohibited from inventing external work, leads, calls, meetings, revenue, documents or results. If an external activity is not integrated or not recorded in HRMS, the system records the evidence gap and lowers confidence rather than assuming completion.

## Daily and month-end calculation

On configured working days, the scheduler stores a daily KRA snapshot. Monthly projection is based on the daily snapshots belonging to the currently active template. Month-end calculation evaluates the complete monthly evidence set again using the active Department + Designation template. Finalization then feeds the existing strike engine.

## New designations

HR can create a new designation under a department. When the new designation is selected in KRA configuration, HR supplies the role scope/KPI context and chooses Generate & Save KRA. The AI creates measurable metrics, targets, weights, evidence sources and evaluation guidance. All generated metrics are automatic; missing evidence reduces confidence rather than creating manual scoring work.

## Template versioning

Regenerating a KRA template deactivates the current template and creates a new active version. Historical KRA scores therefore remain associated with their original template and metric definitions.
