ALTER TABLE "Job" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "Job" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Job" ADD COLUMN "budget" TEXT;
ALTER TABLE "Job" ADD COLUMN "usage" TEXT;

CREATE INDEX "Job_leaseExpiresAt_idx" ON "Job"("leaseExpiresAt");
CREATE INDEX "Job_idempotencyKey_idx" ON "Job"("idempotencyKey");
