ALTER TABLE "IngestionSource" ADD COLUMN "autoPublishAcademicPrograms" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AdminBulkSelection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "administratorId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "actorScope" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "records" JSONB NOT NULL,
  "count" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminBulkSelection_count_check" CHECK ("count" BETWEEN 1 AND 5000)
);
CREATE INDEX "AdminBulkSelection_createdAt_idx" ON "AdminBulkSelection"("createdAt");
CREATE TABLE "AdminBulkConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "selectionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "records" JSONB NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  CONSTRAINT "AdminBulkConfirmation_count_check" CHECK ("count" BETWEEN 1 AND 5000),
  CONSTRAINT "AdminBulkConfirmation_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "AdminBulkSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
