ALTER TABLE "Site" ADD COLUMN "userEvidence" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "OptimizationSuggestion" ADD COLUMN "evidenceIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "OptimizationSuggestion" ADD COLUMN "sourceRevision" INTEGER;
ALTER TABLE "OptimizationSuggestion" ADD COLUMN "contentFormat" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "OptimizationSuggestion" ADD COLUMN "disposition" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "OptimizationSuggestion" ADD COLUMN "recheckAuditId" TEXT;
UPDATE "OptimizationSuggestion" SET "disposition" = 'applied' WHERE "applied" = 1;
