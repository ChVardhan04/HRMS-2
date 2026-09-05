import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_DEPARTMENTS = ['Namandarshan', 'Traininglobe', 'Webisdom', 'Dentedge', 'Perfecto', 'Human Resources'];

function kraEvidenceMeta(label: string) {
  const key = label.trim().toUpperCase();
  if (key.includes('ATTENDANCE') || key.includes('PUNCTUAL')) return { evidenceSource: 'ATTENDANCE', evaluationMethod: 'Use department-specific expected working days, attendance status, check-in time, late count and late penalty days.' };
  if (key.includes('DPR') || key.includes('DAILY REPORT') || key.includes('REPORTING')) return { evidenceSource: 'DPR', evaluationMethod: 'Compare submitted DPRs with expected working days and inspect recorded DPR entries, outputs, blockers and plans.' };
  if (key.includes('PPT') || key.includes('DOCUMENT PREPARATION') || key.includes('PRESENTATION')) return { evidenceSource: 'TASKS|DPR', evaluationMethod: 'Use assigned tasks, completion outputs and DPR entries that document the prepared presentation/document; do not count an artifact unless it is recorded in HRMS.' };
  if (key.includes('DEADLINE') || key.includes('ON-TIME') || key.includes('ON TIME')) return { evidenceSource: 'TASKS', evaluationMethod: 'Compare completed tasks against their recorded due dates; missing due dates are not treated as on-time evidence.' };
  if (key.includes('TASK') || key.includes('COMPLETENESS') || key.includes('PRODUCTIVITY') || key.includes('DELIVERY')) return { evidenceSource: 'TASKS|TASK_AI', evaluationMethod: 'Use task status, EOD status, completion output, proof metadata and task AI completion analysis.' };
  if (key.includes('QUALITY') || key.includes('ACCURACY') || key.includes('GUIDELINE') || key.includes('COMPLIANCE') || key.includes('ERROR')) return { evidenceSource: 'DPR_QUALITY|TASK_AI|DPR', evaluationMethod: 'Use manager-reviewed DPR quality scores plus task AI analysis and documented outputs; lower confidence when review evidence is absent.' };
  if (key.includes('LEAD') || key.includes('BANT') || key.includes('CALL') || key.includes('EMAIL') || key.includes('MEETING') || key.includes('CRM') || key.includes('OUTREACH') || key.includes('LINKEDIN') || key.includes('PIPELINE') || key.includes('PROPOSAL') || key.includes('REVENUE')) return { evidenceSource: 'ATS_ACTIVITY|TASKS|DPR', evaluationMethod: 'Use HRMS/ATS activities performed by the employee plus task and DPR evidence. External activity without an HRMS record must not be invented.' };
  if (key.includes('COLLAB') || key.includes('COMMUNICATION') || key.includes('COORDINATION') || key.includes('OWNERSHIP') || key.includes('INITIATIVE') || key.includes('PROBLEM') || key.includes('RESOLUTION') || key.includes('MENTOR') || key.includes('SUPERVISION') || key.includes('TRAINING')) return { evidenceSource: 'COMMENTS|DPR|TASKS', evaluationMethod: 'Use documented task comments, DPR entries, outputs, blockers, plans and completed work; do not infer interpersonal behavior without records.' };
  return { evidenceSource: 'HRMS_ACTIVITY', evaluationMethod: 'Evaluate only from recorded HRMS activity, including attendance, tasks, DPR and available review evidence. Missing evidence lowers confidence.' };
}

async function seedKraTemplate(orgId: string, id: string, roleName: string, name: string, itemNames: string[], weights?: number[], departmentId?: string, designationId?: string) {
  const otherActive = departmentId && designationId
    ? await prisma.kRATemplate.findFirst({ where: { organizationId: orgId, departmentId, designationId, isActive: true, id: { not: id } }, select: { id: true } })
    : null;
  const shouldBeActive = !otherActive;
  const template = await prisma.kRATemplate.upsert({
    where: { id },
    create: { id, organizationId: orgId, roleName, name, departmentId, designationId, isDefault: id === 'seed-default-template', isActive: shouldBeActive },
    update: { roleName, name, departmentId, designationId, isActive: shouldBeActive, isDefault: id === 'seed-default-template' },
  });
  await prisma.kRAItem.deleteMany({ where: { templateId: template.id } });
  const equal = Number((100 / itemNames.length).toFixed(2));
  for (let i = 0; i < itemNames.length; i++) {
    const raw = itemNames[i];
    const [label, target] = raw.split('||');
    await prisma.kRAItem.create({
      data: {
        templateId: template.id,
        name: label.trim(),
        targetText: target?.trim() || null,
        weightPercent: weights?.[i] ?? (i === itemNames.length - 1 ? Number((100 - equal * (itemNames.length - 1)).toFixed(2)) : equal),
        measurementType: 'PERCENTAGE' as any,
        isAutomated: true,
        ...kraEvidenceMeta(label),
        sortOrder: i,
      },
    });
  }
}

async function main() {
  const initialHrEmail = process.env.INITIAL_HR_EMAIL?.trim().toLowerCase();
  const initialHrPassword = process.env.INITIAL_HR_PASSWORD;
  if (!initialHrEmail) throw new Error('INITIAL_HR_EMAIL must be set');
  if (!initialHrPassword || initialHrPassword.length < 12) throw new Error('INITIAL_HR_PASSWORD must be set and contain at least 12 characters');
  const initialHrPasswordHash = await bcrypt.hash(initialHrPassword, 12);

  console.log('Seeding roles...');
  const roleDefs: { name: RoleName; description: string }[] = [
    { name: 'EMPLOYEE', description: 'Own attendance, to-dos, DPR, leave and KRA' },
    { name: 'MANAGER', description: 'Team attendance, DPR review, tasks, leave and team KRA' },
    { name: 'HR_ADMIN', description: 'HR administration, policies, department configuration, ATS, KRA and reports' },
    { name: 'LEADERSHIP', description: 'Read-only organization reporting' },
    { name: 'SUPER_ADMIN', description: 'System configuration and RBAC' },
  ];
  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) roles[def.name] = await prisma.role.upsert({ where: { name: def.name }, create: def, update: { description: def.description } });

  const org = await prisma.organization.upsert({
    where: { domain: 'webisdom.com' },
    create: {
      name: 'Webisdom Group', domain: 'webisdom.com', timezone: 'Asia/Kolkata',
      officeStartMinutes: 570, officeEndMinutes: 1110, lunchStartMinutes: 810, lunchEndMinutes: 840,
      lateGraceMinutes: 60, attendanceCallStartMinutes: 555, attendanceCallEndMinutes: 570,
      attendanceAbsenceCutoffMinutes: 780, dprSlaMinutes: 1320, dprReminder1Minutes: 1080,
      dprReminder2Minutes: 1200, kraStrikeThresholdScore: 80, kraRollingWindowMonths: 6,
      kraStrikesToEscalate: 3, saturdayWorkPattern: 'ALL_SATURDAYS_OFF',
    },
    update: { name: 'Webisdom Group', timezone: 'Asia/Kolkata', officeStartMinutes: 570, officeEndMinutes: 1110, lunchStartMinutes: 810, lunchEndMinutes: 840, attendanceAbsenceCutoffMinutes: 780 },
  });

  console.log('Seeding departments and HR-configurable policies...');
  const departments: Record<string, any> = {};
  for (const name of DEFAULT_DEPARTMENTS) {
    const department = await prisma.department.upsert({ where: { organizationId_name: { organizationId: org.id, name } }, create: { organizationId: org.id, name }, update: { deletedAt: null } });
    departments[name] = department;
    await prisma.departmentPolicy.upsert({
      where: { departmentId: department.id },
      create: {
        departmentId: department.id,
        mondayWorking: true, tuesdayWorking: true, wednesdayWorking: true, thursdayWorking: true, fridayWorking: true,
        saturdayWorking: false, sundayWorking: false,
        officeStartMinutes: 570, officeEndMinutes: 1110, lunchStartMinutes: 810, lunchEndMinutes: 840,
        checkInOpenMinutes: 570, lateAfterMinutes: 630, halfDayAfterMinutes: 645, checkInCutoffMinutes: 780, autoAbsentMinutes: 780,
        allowedLatesPerMonth: 2, firstLatePenaltyDays: 0, secondLatePenaltyDays: 0, thirdPlusLatePenaltyDays: 1,
        sandwichLeaveEnabled: true, sandwichIncludesPreviousWorkingDay: true, probationMonthlyLeaveLimit: 1, probationMaxDaysPerRequest: 1,
      },
      update: {},
    });
  }

  const hrManagerTitle = await prisma.designation.upsert({
    where: { departmentId_title: { departmentId: departments['Human Resources'].id, title: 'HR Manager' } },
    create: { departmentId: departments['Human Resources'].id, title: 'HR Manager' }, update: {},
  });

  console.log('Seeding department-scoped designations...');
  const webisdomDesignationTitles = [
    'Digital Analyst & Lead Generation Intern','Digital Quality Check Team','SEO Onpage','SEO Off Page','SEO Off Page Team Lead','SEO Analyst','Social Media','Digital Analyst Intern','Designer','Client Servicing & Project Handling','BD Team'
  ];
  const webisdomDesignations: Record<string, any> = {};
  for (const title of webisdomDesignationTitles) {
    webisdomDesignations[title] = await prisma.designation.upsert({
      where: { departmentId_title: { departmentId: departments['Webisdom'].id, title } },
      create: { departmentId: departments['Webisdom'].id, title }, update: { deletedAt: null },
    });
  }
  for (const name of ['Namandarshan','Traininglobe','Dentedge','Perfecto']) {
    await prisma.designation.upsert({
      where: { departmentId_title: { departmentId: departments[name].id, title: 'General Employee' } },
      create: { departmentId: departments[name].id, title: 'General Employee' }, update: { deletedAt: null },
    });
  }

  console.log('Seeding leave types and department leave policies...');
  const leaveTypeDefs = [
    { code: 'CL', name: 'Casual Leave', accrualPerMonth: 0.5, isPaid: true },
    { code: 'SL', name: 'Sick Leave', accrualPerMonth: 7 / 12, isPaid: true },
    { code: 'EL', name: 'Earned Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'WFH', name: 'Work From Home', accrualPerMonth: 0, isPaid: true },
    { code: 'UNPAID', name: 'Unpaid Leave', accrualPerMonth: 0, isPaid: false },
    { code: 'MATERNITY', name: 'Maternity Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'PATERNITY', name: 'Paternity Leave', accrualPerMonth: 0, isPaid: true },
    { code: 'COMP_OFF', name: 'Compensatory Off', accrualPerMonth: 0, isPaid: true },
  ];
  const leaveTypes: Record<string, any> = {};
  for (const lt of leaveTypeDefs) {
    const row = await prisma.leaveType.upsert({ where: { code: lt.code }, create: { ...lt, organizationId: org.id }, update: { ...lt, organizationId: org.id } });
    leaveTypes[lt.code] = row;
  }
  for (const department of Object.values(departments) as any[]) {
    for (const lt of Object.values(leaveTypes) as any[]) {
      const c = lt.code;
      const policy = c === 'CL'
        ? { annualEntitlement: 6, requiresBalance: true, advanceNoticeWorkingDays: 2, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true }
        : c === 'SL'
          ? { annualEntitlement: 7, requiresBalance: true, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: 1, sandwichApplies: true }
          : c === 'UNPAID' || c === 'WFH'
            ? { annualEntitlement: 0, requiresBalance: false, advanceNoticeWorkingDays: 0, allowPostApproval: true, medicalCertificateAfterDays: null, sandwichApplies: false }
            : { annualEntitlement: 0, requiresBalance: lt.isPaid, advanceNoticeWorkingDays: 0, allowPostApproval: false, medicalCertificateAfterDays: null, sandwichApplies: true };
      await prisma.departmentLeavePolicy.upsert({ where: { departmentId_leaveTypeId: { departmentId: department.id, leaveTypeId: lt.id } }, create: { departmentId: department.id, leaveTypeId: lt.id, ...policy }, update: {} });
    }
  }

  console.log('Seeding configurable KRA library from HR supplied KRA sheets...');
  await seedKraTemplate(org.id, 'seed-default-template', 'All Employees', 'Core HRMS Delivery & Compliance', [
    'DPR_SUBMISSION||Daily DPR submitted within configured SLA',
    'TASK_COMPLETION||Assigned task completion based on EOD evidence and AI analysis',
    'ATTENDANCE||Attendance compliance',
    'DPR_QUALITY||Manager quality score',
    'COLLABORATION||Manager assessment',
  ], [20, 30, 20, 15, 15]);

  await seedKraTemplate(org.id, 'kra-digital-leadgen', 'Digital Analyst & Lead Generation Intern', 'Digital Analyst & Lead Generation Intern KRA', [
    'PPT / Document Preparation||2/day (100%)','Deadline Adherence||90–100%','Content Accuracy||95%','Content Completeness||100%','Guideline Compliance||100%','Team Coordination||95%','Problem Resolution||100%',
    'Lead Research & Database Building||50 verified leads/day','LinkedIn Lead Generation||100% relevant','Lead Qualification (BANT)||95–100%','Outreach Emails||50–100/day','Cold Calling||20–30/day','Meeting Scheduling||5–10/month','BANT Qualified Meetings||10/month','CRM / Sheet Management||100%','Lead Accuracy||95%','Communication Quality||100%','Daily Reporting||95%','Professional Learning||95%'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['Digital Analyst & Lead Generation Intern'].id);;
  await seedKraTemplate(org.id, 'kra-digital-qc', 'Digital Quality Check Team', 'Digital Quality Check Team KRA', [
    'Comprehensive Quality Audits','Error Detection Accuracy','Cross-Platform Consistency','Documentation & Feedback Quality','Resolution Monitoring & Follow-up','Preventive Quality Measures','Best Practice Research & Implementation','Client-Specific Compliance','Documentation & Reporting','Team Collaboration and Resolution Monitoring','Resolution Follow-up & Accountability'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['Digital Quality Check Team'].id);;
  await seedKraTemplate(org.id, 'kra-seo-onpage', 'SEO Onpage', 'SEO On-Page KRA', [
    'Keyword Optimization','Internal Linking','Content Optimization','Meta Tag Optimization','Technical SEO Improvements','CTR & Bounce Rate','Internal Linking Optimization','Indexing and Deindexing of Pages','GSC SEO Error Resolution','Page Load Speed Improvement','On-page Audits','Collaboration with Content and Development Teams','Competitor Analysis','Trend Adoption','Productivity','On-page SEO Strategy','Team Supervision','Keyword Strategy Development','Technical SEO Leadership','Trend Adoption & Strategy Evolution','Competitor Analysis & Strategy Development'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['SEO Onpage'].id);;
  await seedKraTemplate(org.id, 'kra-seo-offpage', 'SEO Off Page', 'SEO Off-Page KRA', [
    'Backlink Acquisition||100+ quality backlinks/month','Directory Submissions||100+ submissions/quarter','Domain Authority Improvement||5+ DA/quarter','Content Outreach and PR||95%','Link Quality Maintenance||100% toxic links removed','Competitor Backlink Analysis||3+ strategies/quarter','Trend Adoption||1+ trend/quarter','Guest Posting||5+ posts/month','Social Bookmarking||100%','Quora/Forum Posting||10+ posts/week','Brand Mentions and Citation Building||95%','Monthly Off-Page SEO Report||100%','Productivity||90%+'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['SEO Off Page'].id);;
  await seedKraTemplate(org.id, 'kra-seo-offpage-lead', 'SEO Off Page Team Lead', 'SEO Off-Page Team Lead KRA', [
    'Backlink Acquisition','Directory Submissions','Domain Authority Improvement','Content Outreach and PR','Link Quality Maintenance','Competitor Backlink Analysis','Trend Adoption','Guest Posting','Social Bookmarking','Quora/Forum Posting','Brand Mentions and Citation Building','Monthly Off-Page SEO Report','Productivity','Team Supervision','Mentoring New Interns','Training Existing Team Members','Conducting Team Meetings','Performance Monitoring','Backlink Strategy','Outreach Strategy','Trend Adoption & Strategy Evolution','Competitor Analysis & Strategy Development'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['SEO Off Page Team Lead'].id);;
  await seedKraTemplate(org.id, 'kra-seo-analyst', 'SEO Analyst', 'SEO Analyst KRA', [
    'SEO Activity Monitoring','SEO Performance Reporting','Google My Business Management','Quora Engagement and Content Posting','Forum Posting and Participation','Backlink Profile Monitoring','SEO Audit and Issue Identification','Competitor SEO Tracking','Content Performance Tracking','Research & Trend Identification','SEO Data Analysis','Monthly SEO Performance Report','Tracker Maintenance'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['SEO Analyst'].id);;
  await seedKraTemplate(org.id, 'kra-social-media', 'Social Media', 'Social Media KRA', ['Engagement Metrics','Follower Growth','Reach & Impressions','Content Performance','Team Performance','Lead Generation'], undefined, departments['Webisdom'].id, webisdomDesignations['Social Media'].id)
  await seedKraTemplate(org.id, 'kra-digital-analyst-intern', 'Digital Analyst Intern', 'Digital Analyst Intern KRA', [
    'Documents Presentation (PPT) Prepared||2 presentations/documents per working day when assigned',
    'Deadline Adherence||Assigned PPT/document tasks submitted within their recorded due date/EOD commitment',
    'Content Accuracy||Accurate task outputs with manager-reviewed quality and AI task evidence',
    'Completeness||Assigned work completed with documented output/proof and DPR evidence',
    'Compliance with Guidelines||Recorded deliverables follow the documented task brief/guidelines',
    'Collaboration and Communication||Documented coordination through task comments, DPR updates and manager review',
    'Problem-Solving & Initiative||Documented blockers, resolutions, proactive outputs and completed work'
  ], undefined, departments['Webisdom'].id, webisdomDesignations['Digital Analyst Intern'].id)
  await seedKraTemplate(org.id, 'kra-designer', 'Designer', 'Designer KRA', ['Design Quality','Website Quality','Video Quality','Creativity & Originality','Brand Guidelines & Brief','User Experience (UX) Design','Timeliness of Delivery','Adaptability Across Formats','Client & Team Collaboration','Attention to Detail','Software Proficiency & Skill Development','Trend Adoption & Implementation','Productivity','Design Revisions & Iterations','Audio-Visual Synchronization','Rendering & Export Quality','Prototyping & Wireframing','User Research & Testing','Responsiveness & Adaptability','Accessibility Compliance','Information Architecture','Interaction & Visual Design'], undefined, departments['Webisdom'].id, webisdomDesignations['Designer'].id)
  await seedKraTemplate(org.id, 'kra-client-servicing', 'Client Servicing & Project Handling', 'Client Servicing & Project Handling KRA', ['Active Clients Handled||10–20+','Client Retention||90%+','Client Renewal||3–5+/month','Client Meetings||15–25+/month','Client Follow-Ups||100%','Client Satisfaction||90%+','Project Handling||10–20+/month','Project Delivery||90–100%','Requirement Accuracy||95%+','Quality of Deliverables||95%+','Presales Support||3–5+/month','Upselling – Existing Clients||2–3+/month','Cross-Selling – Existing/Old Clients||2–3+/month','Revenue from Existing Clients||Track separately','Reactivation of Old Clients||5–10+/month','Old Client Conversion||1–2+/month','Referral Generation||1–3+/month','Client Expansion','Payment & Commercial Follow-up||100%','Issue Resolution','Internal Coordination||100%','Client Documentation||100%','Reporting & MIS||100%','Client Relationship Development','Initiative & Ownership'], undefined, departments['Webisdom'].id, webisdomDesignations['Client Servicing & Project Handling'].id)
  await seedKraTemplate(org.id, 'kra-bd-team', 'BD Team', 'BD Team KRA / Performance Summary', [
    'Lead Generation & BANT Qualification||10–15 BANT-qualified Indian leads + 5 international leads/month','Client Meetings||20–30 qualified meetings/month','Lead Nurturing & Follow-ups','Pipeline Management','Proposal & Pitching','Closures & Revenue Generation','Client Engagement & Relationship Building','CRM/Tracker & Reporting||100% accurate and timely','Communication & Presentation','Initiative, Ownership & Coordination'
  ], [15,10,10,10,10,25,5,5,5,5], departments['Webisdom'].id, webisdomDesignations['BD Team'].id);

  console.log('Seeding holidays...');
  const holidays = [
    ['NEW YEAR','2026-01-01',false,null],['REPUBLIC DAY','2026-01-26',false,null],['HOLI','2026-03-03',false,null],
    ['BAKRID','2026-05-27',true,'To valid religious group'],['INDEPENDENCE DAY','2026-08-15',false,null],['RAKSHA BANDHAN','2026-08-28',false,null],
    ['MAHATMA GANDHI JAYANTI','2026-10-02',false,null],['VIJAYA DASHAMI/DUSSEHRA','2026-10-20',true,'To valid religious group'],['DEEPAWALI','2026-11-08',false,null],['CHRISTMAS','2026-12-25',false,null],
  ] as const;
  for (const [name, date, isOptional, audienceNote] of holidays) {
    const d = new Date(`${date}T00:00:00.000Z`);
    await prisma.holiday.upsert({ where: { organizationId_date_name: { organizationId: org.id, date: d, name } }, create: { organizationId: org.id, name, date: d, isOptional, audienceNote }, update: { isOptional, audienceNote } });
  }

  console.log('Creating initial HR administrator...');
  const existingUser = await prisma.user.findUnique({ where: { email: initialHrEmail } });
  let hrUserId: string;
  if (existingUser) {
    const updated = await prisma.user.update({ where: { id: existingUser.id }, data: { passwordHash: initialHrPasswordHash, failedLoginCount: 0, lockedUntil: null, isActive: true, mustChangePassword: false, roles: { deleteMany: {}, create: [{ roleId: roles.HR_ADMIN.id }] } } });
    hrUserId = updated.id;
  } else {
    hrUserId = (await prisma.user.create({ data: { email: initialHrEmail, passwordHash: initialHrPasswordHash, isActive: true, mustChangePassword: false, roles: { create: [{ roleId: roles.HR_ADMIN.id }] } } })).id;
  }
  const existingHr = await prisma.employee.findUnique({ where: { userId: hrUserId } });
  if (!existingHr) await prisma.employee.create({ data: { employeeCode: `EMP-${Math.floor(100000 + Math.random()*900000)}`, userId: hrUserId, firstName: 'HR', lastName: 'Administrator', dateOfJoining: new Date(), employmentStatus: 'CONFIRMED', departmentId: departments['Human Resources'].id, designationId: hrManagerTitle.id } });

  await prisma.policy.upsert({ where: { id: 'seed-policy-attendance' }, create: { id: 'seed-policy-attendance', organizationId: org.id, title: 'Leave & Attendance Policy', description: 'Department-aware working calendar, attendance, late-entry, leave, sandwich leave and daily delivery rules are configured by HR.', publishedAt: new Date() }, update: { description: 'Department-aware working calendar, attendance, late-entry, leave, sandwich leave and daily delivery rules are configured by HR.' } });
  console.log(`HRMS seed complete. Initial HR: ${initialHrEmail}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => prisma.$disconnect());
