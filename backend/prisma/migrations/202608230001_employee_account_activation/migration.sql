CREATE TABLE "AccountActivationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActivationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountActivationToken_tokenHash_key" ON "AccountActivationToken"("tokenHash");
CREATE INDEX "AccountActivationToken_userId_idx" ON "AccountActivationToken"("userId");
CREATE INDEX "AccountActivationToken_expiresAt_idx" ON "AccountActivationToken"("expiresAt");
ALTER TABLE "AccountActivationToken" ADD CONSTRAINT "AccountActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
