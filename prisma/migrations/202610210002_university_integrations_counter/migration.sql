-- Additive: keep legacy baseline metadata, visit aggregates and all existing content.
ALTER TABLE "SiteSettings" ADD COLUMN "visitorStartingValue" INTEGER NOT NULL DEFAULT 0;
UPDATE "SiteSettings" SET "visitorStartingValue" = GREATEST("visitorBaseline", 0);
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_starting_value_nonnegative" CHECK ("visitorStartingValue" >= 0);
CREATE TABLE "UniversityApiKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "universityId" TEXT NOT NULL REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "keyHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "UniversityApiKey_keyHash_key" ON "UniversityApiKey"("keyHash");
CREATE INDEX "UniversityApiKey_universityId_createdAt_idx" ON "UniversityApiKey"("universityId", "createdAt");
CREATE UNIQUE INDEX "UniversityApiKey_one_active_per_university" ON "UniversityApiKey"("universityId") WHERE "revokedAt" IS NULL;
