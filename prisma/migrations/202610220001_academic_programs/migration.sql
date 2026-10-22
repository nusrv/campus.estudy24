-- Additive directory: no existing content, accounts, keys or migration history are changed.
CREATE TABLE "AcademicProgram" (
  "id" TEXT NOT NULL,
  "universityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "degreeName" TEXT,
  "college" TEXT,
  "department" TEXT,
  "campus" TEXT,
  "creditHours" DOUBLE PRECISION,
  "studyMode" TEXT,
  "tuitionInfo" TEXT,
  "tuitionVerified" BOOLEAN NOT NULL DEFAULT false,
  "tuitionSourceUrl" TEXT,
  "description" TEXT,
  "sourceUrl" TEXT,
  "officialProgramUrl" TEXT,
  "studyPlanUrl" TEXT,
  "sourceId" TEXT,
  "sourceSystem" TEXT,
  "externalId" TEXT,
  "sourceKey" TEXT,
  "origin" "OriginType" NOT NULL DEFAULT 'manual',
  "lastSyncedAt" TIMESTAMP(3),
  "fingerprint" TEXT,
  "sourceSnapshot" JSONB,
  "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PublicationStatus" NOT NULL DEFAULT 'pending_review',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicProgram_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicProgram_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicProgram_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicProgram_credit_hours_check" CHECK ("creditHours" IS NULL OR ("creditHours" >= 0 AND "creditHours" <= 5000)),
  CONSTRAINT "AcademicProgram_tuition_check" CHECK (("tuitionInfo" IS NULL AND NOT "tuitionVerified" AND "tuitionSourceUrl" IS NULL) OR ("tuitionInfo" IS NOT NULL AND "tuitionVerified" AND "tuitionSourceUrl" IS NOT NULL)),
  CONSTRAINT "AcademicProgram_source_check" CHECK (("origin" = 'manual' AND "sourceId" IS NULL AND "sourceSystem" IS NULL AND "externalId" IS NULL AND "sourceKey" IS NULL) OR ("origin" = 'imported' AND "sourceId" IS NOT NULL AND "sourceSystem" IS NOT NULL AND "externalId" IS NOT NULL AND "sourceKey" IS NOT NULL))
);
CREATE UNIQUE INDEX "AcademicProgram_sourceKey_key" ON "AcademicProgram"("sourceKey");
CREATE UNIQUE INDEX "AcademicProgram_universityId_sourceSystem_externalId_key" ON "AcademicProgram"("universityId", "sourceSystem", "externalId");
CREATE INDEX "AcademicProgram_universityId_status_visible_deletedAt_idx" ON "AcademicProgram"("universityId", "status", "visible", "deletedAt");
CREATE INDEX "AcademicProgram_universityId_degreeName_college_idx" ON "AcademicProgram"("universityId", "degreeName", "college");
