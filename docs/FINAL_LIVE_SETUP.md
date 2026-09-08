# HRMS Live Setup Checklist

## 1. Backend environment

Copy `backend/.env.example` to `backend/.env` and provide real values for the database, JWT secrets, initial HR account and optional AI/storage/email services.

## 2. Database

From `backend`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

The `202609070002_schema_safety_repair` migration is intentionally idempotent for the recent HRMS schema additions. It repairs missing columns/tables without resetting existing data.

## 3. Frontend

Copy `frontend/.env.example` to `frontend/.env` and verify `NEXT_PUBLIC_API_BASE_URL`.

```bash
npm install
npm run build
npm run dev
```

## 4. Backend

```bash
npm run build
npm run start:dev
```

## 5. KRA

1. HR opens KRA & Performance.
2. HR selects Department + Designation.
3. HR reviews the saved metrics from the HR supplied KRA library.
4. For a new designation, HR enters the role profile and uses Generate & Save KRA.
5. Employees add monthly commitments.
6. Employees update completion percentage and evidence at month end.
7. HR runs Calculate KRA Now for the month-end result.
8. AI compares company/designation metrics with employee commitments and actual HRMS evidence.
9. Manager/HR reviews the result before treating it as final.

## 6. Group Monitor

Register the external WhatsApp/Teams/Slack group and paste its invite/group link. The HRMS stores the audit/check information and provides an Open Group action that opens the external application/link. It does not attempt to recreate external chat functionality.

## 7. Important

Never commit real `.env` files or secrets.

Do not run `prisma migrate reset` against a live database.
