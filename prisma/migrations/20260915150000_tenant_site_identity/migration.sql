-- A public URL is not an ownership boundary. Each owner needs an independent
-- Site record so reports, monitoring, and evidence never cross workspaces.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Site" (
    "userEvidence" TEXT NOT NULL DEFAULT '[]',
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "ownerId" TEXT NOT NULL DEFAULT 'local',
    "monitored" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "monitorEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monitorIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "monitorSchedulePreset" TEXT NOT NULL DEFAULT 'daily',
    "monitorHealthCheck" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" DATETIME,
    "lastMonitorStatus" TEXT,
    "lastMonitorError" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "vertical" TEXT,
    "cohortTags" TEXT,
    "profile" TEXT,
    "profileVersion" TEXT,
    "profileConfirmedAt" DATETIME,
    "profileConfirmedBy" TEXT,
    "monitorSimulation" BOOLEAN NOT NULL DEFAULT false,
    "monitorFailureCount" INTEGER NOT NULL DEFAULT 0,
    "monitorLockedAt" DATETIME,
    "monitorPageUrls" TEXT,
    "monitorSimulationPrompts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_Site" (
    "userEvidence", "id", "url", "name", "ownerId", "monitored", "webhookUrl",
    "monitorEnabled", "monitorIntervalHours", "monitorSchedulePreset", "monitorHealthCheck",
    "nextRunAt", "lastMonitorStatus", "lastMonitorError", "timezone", "vertical", "cohortTags",
    "profile", "profileVersion", "profileConfirmedAt", "profileConfirmedBy", "monitorSimulation",
    "monitorFailureCount", "monitorLockedAt", "monitorPageUrls", "monitorSimulationPrompts", "createdAt"
)
SELECT
    "userEvidence", "id", "url", "name", "ownerId", "monitored", "webhookUrl",
    "monitorEnabled", "monitorIntervalHours", "monitorSchedulePreset", "monitorHealthCheck",
    "nextRunAt", "lastMonitorStatus", "lastMonitorError", "timezone", "vertical", "cohortTags",
    "profile", "profileVersion", "profileConfirmedAt", "profileConfirmedBy", "monitorSimulation",
    "monitorFailureCount", "monitorLockedAt", "monitorPageUrls", "monitorSimulationPrompts", "createdAt"
FROM "Site";

DROP TABLE "Site";
ALTER TABLE "new_Site" RENAME TO "Site";

CREATE UNIQUE INDEX "Site_ownerId_url_key" ON "Site"("ownerId", "url");
CREATE INDEX "Site_ownerId_idx" ON "Site"("ownerId");

PRAGMA foreign_keys=ON;
