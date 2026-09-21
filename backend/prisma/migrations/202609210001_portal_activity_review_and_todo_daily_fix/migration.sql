CREATE TYPE "PortalActivityReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "WorkDay"
  ADD COLUMN "portalActivityReviewStatus" "PortalActivityReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "portalActivityReviewedById" TEXT,
  ADD COLUMN "portalActivityReviewedAt" TIMESTAMP(3),
  ADD COLUMN "portalActivityReviewNote" TEXT;
