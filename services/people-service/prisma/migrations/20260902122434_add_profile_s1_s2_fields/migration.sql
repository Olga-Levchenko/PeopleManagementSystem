/*
  Warnings:

  - Added the required column `fullName` to the `people` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "birthdayDay" INTEGER,
ADD COLUMN     "birthdayMonth" INTEGER,
ADD COLUMN     "countryCity" TEXT,
ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "personalPhone" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "residentialAddress" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "workEmail" TEXT,
ADD COLUMN     "workPhone" TEXT;
