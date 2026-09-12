-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActionItemSource" AS ENUM ('manual', 'campaign');

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneePersonId" TEXT NOT NULL,
    "authorPersonId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "linkUrl" TEXT,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'open',
    "source" "ActionItemSource" NOT NULL DEFAULT 'manual',
    "completionDate" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);
