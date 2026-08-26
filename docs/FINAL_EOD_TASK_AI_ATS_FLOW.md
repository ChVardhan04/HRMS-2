# Final HRMS EOD Task + AI + ATS Flow

## Daily employee flow
1. Employee checks in.
2. WorkDay unlocks the day's To-Dos.
3. Manager-assigned and personal tasks are tracked against the same WorkDay.
4. During EOD, each task must be resolved:
   - COMPLETED: screenshot proof + hours + completion summary.
   - INCOMPLETE: valid reason + hours.
5. Completed tasks and incomplete task evidence feed the DPR draft automatically.
6. Employee reviews and submits the DPR.
7. On DPR submission, the AI task-completion analyst compares each assigned task with the submitted DPR text and stores a 0-100 completion estimate plus analysis metadata.
8. Checkout is allowed only when all tasks are resolved and today's DPR is submitted.
9. KRA TASK_COMPLETION uses the stored AI completion percentages rather than a simple binary completed/not-completed count.
10. Monthly KRA continues to combine DPR submission, AI task completion, attendance, DPR quality and collaboration according to the configured template. A score below the configured threshold can generate a strike under the rolling-window policy.

## Evidence rule
- Screenshot proof is stored through the storage abstraction and is visible to the employee, manager and HR according to access rules.
- Employees cannot mark another employee's task complete.
- Incomplete tasks cannot be silently left unresolved at checkout.

## AI rule
- With OPENAI_API_KEY configured, the task analyst uses the configured AI model.
- If the AI provider is unavailable, a deterministic fallback is used and the stored analysis records the fallback provider. This prevents the HRMS from becoming unusable when an external AI service is unavailable.

## ATS flow
Select Job -> Upload Resume -> Parse Resume -> Create/Reuse Candidate -> Attach Candidate to Job -> Calculate JD-specific ATS Score -> Save Screening Result -> Move Candidate to RESUME_SCREEN -> Show Candidate in ATS pipeline.

The ATS score is a decision-support signal and does not automatically reject candidates.
