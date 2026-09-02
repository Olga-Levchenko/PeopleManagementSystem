/*
  Warnings:

  - Made the column `leaveType` on table `leaves` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "leaves" ALTER COLUMN "leaveType" SET NOT NULL;
