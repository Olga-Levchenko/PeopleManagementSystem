-- CreateTable
CREATE TABLE "management_notes" (
    "id" TEXT NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "authorPersonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibleForEmployee" BOOLEAN NOT NULL DEFAULT false,
    "visibleForPm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "management_notes_pkey" PRIMARY KEY ("id")
);
