-- Keep all existing KRA metrics automated and make the seeded Digital Analyst Intern template explicit about evidence/targets.
UPDATE "KRAItem"
SET "isAutomated" = TRUE
WHERE "templateId" = 'kra-digital-analyst-intern';

UPDATE "KRAItem" SET
  "targetText" = '2 presentations/documents per working day when assigned',
  "evidenceSource" = 'TASKS|DPR',
  "evaluationMethod" = 'Count assigned presentation/document work only when HRMS contains task or DPR evidence. Use completion output/proof and compare the supported count with the role target; do not invent files or presentations.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Documents Presentation (PPT) Prepared';

UPDATE "KRAItem" SET
  "targetText" = 'Assigned PPT/document tasks submitted within their recorded due date/EOD commitment',
  "evidenceSource" = 'TASKS',
  "evaluationMethod" = 'Compare completed tasks with their recorded due dates and completion timestamps. Tasks without a due date are not counted as on-time evidence.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Deadline Adherence';

UPDATE "KRAItem" SET
  "targetText" = 'Accurate task outputs with manager-reviewed quality and AI task evidence',
  "evidenceSource" = 'DPR_QUALITY|TASK_AI|DPR',
  "evaluationMethod" = 'Use manager DPR quality score, AI task completion analysis and documented outputs. Reduce confidence when no manager review or analyzable output exists.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Content Accuracy';

UPDATE "KRAItem" SET
  "targetText" = 'Assigned work completed with documented output/proof and DPR evidence',
  "evidenceSource" = 'TASKS|TASK_AI|DPR',
  "evaluationMethod" = 'Use task completion status, output summary, submitted proof, AI completion analysis and DPR inclusion to assess whether assigned work is complete.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Completeness';

UPDATE "KRAItem" SET
  "targetText" = 'Recorded deliverables follow the documented task brief/guidelines',
  "evidenceSource" = 'DPR_QUALITY|TASK_AI|TASKS',
  "evaluationMethod" = 'Compare task description/brief with completion output and AI analysis, supported by manager DPR quality review. Do not assume guideline compliance without recorded evidence.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Compliance with Guidelines';

UPDATE "KRAItem" SET
  "targetText" = 'Documented coordination through task comments, DPR updates and manager review',
  "evidenceSource" = 'COMMENTS|DPR|TASKS',
  "evaluationMethod" = 'Evaluate documented task comments, DPR updates, blockers, plans and completed shared work. Do not infer communication quality from personality or unrecorded conversations.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Collaboration and Communication';

UPDATE "KRAItem" SET
  "targetText" = 'Documented blockers, resolutions, proactive outputs and completed work',
  "evidenceSource" = 'COMMENTS|DPR|TASKS',
  "evaluationMethod" = 'Use recorded blockers, resolution notes, proactive task outputs, comments and completed work as evidence of problem solving and initiative. Missing records lower confidence.'
WHERE "templateId" = 'kra-digital-analyst-intern' AND "name" = 'Problem-Solving & Initiative';
