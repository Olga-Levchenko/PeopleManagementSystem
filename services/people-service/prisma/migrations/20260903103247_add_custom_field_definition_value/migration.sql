-- CreateEnum
CREATE TYPE "CustomFieldVisibility" AS ENUM ('MANAGEMENT', 'EMPLOYEE', 'COLLEAGUE');

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" "CustomFieldVisibility" NOT NULL DEFAULT 'MANAGEMENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_definitionId_personId_key" ON "custom_field_values"("definitionId", "personId");

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
