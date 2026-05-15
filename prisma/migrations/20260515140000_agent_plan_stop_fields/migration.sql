-- Agent plan: cooperative stop + queue job binding
ALTER TABLE "AgentPlan" ADD COLUMN "stopRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AgentPlan" ADD COLUMN "activeJobId" TEXT;
