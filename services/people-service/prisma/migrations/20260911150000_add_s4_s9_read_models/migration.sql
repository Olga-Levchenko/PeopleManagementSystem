-- AlterTable
ALTER TABLE "people" ADD COLUMN "employmentType" TEXT,
ADD COLUMN "grade" TEXT,
ADD COLUMN "seniority" TEXT,
ADD COLUMN "englishLevel" TEXT;

-- CreateTable
CREATE TABLE "career_timeline_events" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "career_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_timeline_events_personId_occurredAt_idx" ON "career_timeline_events"("personId", "occurredAt");

-- AddForeignKey
ALTER TABLE "career_timeline_events" ADD CONSTRAINT "career_timeline_events_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
