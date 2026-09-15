-- Comparison payloads are tenant data even when the target URL is public.
ALTER TABLE "ComparisonRun" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT 'local';
CREATE INDEX "ComparisonRun_ownerId_idx" ON "ComparisonRun"("ownerId");
