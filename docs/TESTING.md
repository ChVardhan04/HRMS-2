# Testing and Verification

## Automated test commands

```bash
npm ci
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend
npm run lint
npm run build
npm test --workspace backend -- --ci
```

The backend also has an e2e Jest configuration at `backend/test/jest-e2e.json` for database-backed tests.

## Implemented unit coverage

- Calendar business-day rules include first/third Saturday working behavior and holiday overrides.
- DPR tests cover notification dependency and submission workflow behavior.
- Existing backend unit suites remain under `backend/src/**/*.spec.ts`.

## Manual acceptance flow

### Daily operations

1. Login as employee.
2. Check in.
3. Confirm WorkDay exists.
4. Create/receive a task.
5. Complete the task.
6. Confirm the DPR auto-fills from the completed task.
7. Add additional DPR details.
8. Submit DPR.
9. Login as manager and approve/request changes/reject.
10. Confirm notification and KRA inputs update.

### Leave

1. Employee applies for leave.
2. Manager approves/rejects.
3. HR finalizes.
4. Confirm leave balance, WorkDay and attendance synchronize.
5. Test cross-year requests and overlapping requests.

### ATS

1. HR creates requisition.
2. HR approves.
3. Finance or Leadership completes the next approval.
4. Publish the role.
5. Apply through careers page or import CSV.
6. Move candidate through stages.
7. Schedule interview with a panelist.
8. Submit one scorecard per assigned panelist.
9. Create/send offer and test tokenized response.

## Sandbox verification note

The final source tree was syntax-checked across TypeScript/TSX files and the custom XLSX generator was
opened successfully with Python's ZIP reader. A full dependency-backed NestJS/Next.js build, Prisma
engine generation/migration execution and live PostgreSQL/Redis workflow could not be executed in the
restricted build environment because the npm registry hostname was not resolvable and the interrupted
install left an incomplete dependency tree. The CI workflow is configured to perform those checks in a
normal networked environment.
