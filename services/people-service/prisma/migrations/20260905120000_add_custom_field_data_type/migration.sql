-- CreateEnum
CREATE TYPE "CustomFieldDataType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN');

-- AlterTable
ALTER TABLE "custom_field_definitions" ADD COLUMN "dataType" "CustomFieldDataType" NOT NULL DEFAULT 'TEXT';
