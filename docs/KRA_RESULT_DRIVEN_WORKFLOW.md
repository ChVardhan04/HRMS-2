# Result-Driven KRA Workflow

## Monthly cycle

1. HR configures and saves the expected KRA metrics for every department/designation.
2. No generic/default KRA template is automatically assigned to employees.
3. Employees create commitments only for the current calendar month.
4. Every commitment should be mapped to a saved designation KRA metric. The system checks the mapping after save and shows a red warning when the commitment is not aligned.
5. The commitment deadline is automatically the last calendar day of that month.
6. During the month, the employee records completion percentage, result notes and evidence.
7. When the month closes, the commitment period is locked. The next month opens automatically.
8. On the 7th of the following month, the scheduler calculates and finalizes the previous month's KRA.
9. AI compares the designation metrics and targets with aligned employee commitments/results and recorded HRMS evidence such as attendance, To-Dos, DPRs and quality evidence.
10. The final KRA is a weighted result score. HR/Manager can review the result; finalization is not performed by employees.

## Commitment alignment

The employee can select the exact expected KRA metric or use automatic matching. Automatic matching uses the commitment title, description and unit against the saved metric name, description, target and unit. The UI marks:

- Aligned: green
- Partially aligned: yellow
- Not aligned: red

The alignment check is deterministic and does not consume AI credits. The AI is reserved for the actual monthly result evaluation.

## Monthly scoring date

The monthly KRA job runs at 09:00 in the organization's configured timezone on the 7th day of every month. It evaluates the immediately preceding calendar month.

Manual calculation from the HR screen is a preview/recalculation tool only. It does not change the scheduled 7th-day finalization rule.
