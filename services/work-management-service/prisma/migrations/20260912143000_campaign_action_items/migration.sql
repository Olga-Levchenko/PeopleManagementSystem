-- AlterTable
ALTER TABLE "action_items" ADD COLUMN "campaignId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "action_items_campaignId_assigneePersonId_key" ON "action_items"("campaignId", "assigneePersonId");

-- CreateTable
CREATE TABLE "processed_campaign_activation_events" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_campaign_activation_events_pkey" PRIMARY KEY ("eventId")
);
