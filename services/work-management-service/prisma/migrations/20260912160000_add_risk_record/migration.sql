-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'need_attention', 'medium', 'high', 'leaver');

-- CreateTable
CREATE TABLE "risk_records" (
    "id" TEXT NOT NULL,
    "subjectPersonId" TEXT NOT NULL,
    "authorPersonId" TEXT NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "description" TEXT NOT NULL,
    "details" TEXT,
    "recordedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_records_subjectPersonId_recordedAt_idx" ON "risk_records"("subjectPersonId", "recordedAt");
