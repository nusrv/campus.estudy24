CREATE TABLE "CourseExplanation" (
  "id" TEXT PRIMARY KEY, "wordpressId" INTEGER NOT NULL UNIQUE,
  "sourceTitle" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "searchText" TEXT NOT NULL, "destinationUrl" TEXT NOT NULL, "imageUrl" TEXT,
  "categoryIds" INTEGER[] NOT NULL, "sourceModifiedAt" TIMESTAMP(3) NOT NULL,
  "sourcePublished" BOOLEAN NOT NULL DEFAULT true, "mappingState" TEXT NOT NULL DEFAULT 'unknown',
  "universityId" TEXT REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseExplanation_identity_check" CHECK ("wordpressId" > 0),
  CONSTRAINT "CourseExplanation_mapping_check" CHECK (("mappingState" = 'mapped' AND "universityId" IS NOT NULL) OR ("mappingState" IN ('unknown','ambiguous') AND "universityId" IS NULL))
);
CREATE INDEX "CourseExplanation_public_idx" ON "CourseExplanation"("universityId", "sourcePublished", "mappingState", "title");
CREATE TABLE "CourseSourceCategory" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "parent" INTEGER NOT NULL, "courseCount" INTEGER NOT NULL, "lastSyncedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CourseUniversityMapping" (
  "id" TEXT PRIMARY KEY, "categoryId" INTEGER NOT NULL UNIQUE CHECK ("categoryId" > 0),
  "universityId" TEXT NOT NULL REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CourseCatalogSettings" ("id" TEXT PRIMARY KEY DEFAULT 'main', "enabled" BOOLEAN NOT NULL DEFAULT false, "lastSuccessfulSyncAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CourseSyncRun" (
  "id" TEXT PRIMARY KEY, "trigger" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'running', "errorCode" TEXT, "inventoryDigest" TEXT,
  "fetched" INTEGER NOT NULL DEFAULT 0, "mapped" INTEGER NOT NULL DEFAULT 0, "unknown" INTEGER NOT NULL DEFAULT 0,
  "ambiguous" INTEGER NOT NULL DEFAULT 0, "removed" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "CourseSyncRun_startedAt_idx" ON "CourseSyncRun"("startedAt");
