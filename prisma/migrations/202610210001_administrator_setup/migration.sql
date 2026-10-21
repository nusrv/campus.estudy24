-- Additive only: preserve existing administrators, hashes, sessions and content.
CREATE TABLE "AdministrationBootstrap" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Seal browser bootstrap on installations that already have administrators.
INSERT INTO "AdministrationBootstrap" ("id")
SELECT 'initial-owner' WHERE EXISTS (SELECT 1 FROM "Administrator");
CREATE TABLE "AdminPasswordReset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "administratorId" TEXT NOT NULL REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AdminPasswordReset_tokenHash_key" ON "AdminPasswordReset"("tokenHash");
CREATE INDEX "AdminPasswordReset_expiresAt_idx" ON "AdminPasswordReset"("expiresAt");
