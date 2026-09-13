ALTER TABLE "AiSimulation" ADD COLUMN "executionMode" TEXT;
ALTER TABLE "AiSimulation" ADD COLUMN "provider" TEXT;
ALTER TABLE "AiSimulation" ADD COLUMN "model" TEXT;
ALTER TABLE "AiSimulation" ADD COLUMN "tokens" TEXT;
ALTER TABLE "AiSimulation" ADD COLUMN "retrievalEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AiSimulation_executionMode_idx" ON "AiSimulation"("executionMode");
