CREATE TABLE "MediaDeletionJob" (
  "filename" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaDeletionJob_pkey" PRIMARY KEY ("filename")
);
