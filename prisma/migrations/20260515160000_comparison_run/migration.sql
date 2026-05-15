-- Persist full competitor comparison runs for UI
CREATE TABLE "ComparisonRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUrl" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ComparisonRun_targetUrl_idx" ON "ComparisonRun"("targetUrl");
CREATE INDEX "ComparisonRun_createdAt_idx" ON "ComparisonRun"("createdAt");
