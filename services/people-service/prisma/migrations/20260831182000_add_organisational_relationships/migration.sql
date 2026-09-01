-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('REPORTS_TO', 'PP_ASSIGNMENT', 'DEPARTMENT_MEMBERSHIP', 'DEPARTMENT_MANAGER');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxAggregateType" AS ENUM ('PERSON', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "FreshnessStatus" AS ENUM ('UNCERTAIN', 'CONFIRMED');

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "managerId" UUID,
    "peoplePartnerId" UUID,
    "departmentId" UUID,
    "relationshipVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "managerId" UUID,
    "relationshipVersion" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_journal_entries" (
    "id" UUID NOT NULL,
    "relationship" "RelationshipType" NOT NULL,
    "actorId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "beforeId" UUID,
    "afterId" UUID,
    "occurredAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "relationship_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "eventId" UUID NOT NULL,
    "aggregateType" "OutboxAggregateType" NOT NULL,
    "aggregateId" UUID NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAtUtc" TIMESTAMP(3),
    "lockedAtUtc" TIMESTAMP(3),
    "lockedBy" UUID,
    CONSTRAINT "outbox_events_aggregateType_aggregateId_aggregateVersion_key"
        UNIQUE ("aggregateType", "aggregateId", "aggregateVersion"),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "relationship_projection_freshness" (
    "subjectId" UUID NOT NULL,
    "status" "FreshnessStatus" NOT NULL DEFAULT 'CONFIRMED',
    "reason" TEXT,
    "detectedAtUtc" TIMESTAMP(3),
    "lastConfirmedAtUtc" TIMESTAMP(3),
    CONSTRAINT "relationship_projection_freshness_pkey" PRIMARY KEY ("subjectId")
);

-- CreateIndex
CREATE INDEX "relationship_journal_entries_subjectId_occurredAtUtc_idx"
    ON "relationship_journal_entries"("subjectId", "occurredAtUtc");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx"
    ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateId_aggregateVersion_idx"
    ON "outbox_events"("aggregateId", "aggregateVersion");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_peoplePartnerId_fkey"
    FOREIGN KEY ("peoplePartnerId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
