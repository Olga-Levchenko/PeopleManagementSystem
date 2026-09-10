-- CreateTable
CREATE TABLE "employee_list_saved_views" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "creatorPersonId" UUID NOT NULL,
    "configuration" JSONB NOT NULL,
    "pageSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_list_saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_list_saved_view_shares" (
    "id" UUID NOT NULL,
    "viewId" UUID NOT NULL,
    "recipientPersonId" UUID NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_list_saved_view_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_list_saved_views_creatorPersonId_idx" ON "employee_list_saved_views"("creatorPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_list_saved_views_creatorPersonId_name_key" ON "employee_list_saved_views"("creatorPersonId", "name");

-- CreateIndex
CREATE INDEX "employee_list_saved_view_shares_recipientPersonId_idx" ON "employee_list_saved_view_shares"("recipientPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_list_saved_view_shares_viewId_recipientPersonId_key" ON "employee_list_saved_view_shares"("viewId", "recipientPersonId");

-- AddForeignKey
ALTER TABLE "employee_list_saved_view_shares" ADD CONSTRAINT "employee_list_saved_view_shares_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "employee_list_saved_views"("id") ON DELETE CASCADE ON UPDATE CASCADE;
