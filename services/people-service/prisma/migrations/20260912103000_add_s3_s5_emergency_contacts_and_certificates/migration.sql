-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "contactName" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_certificates" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emergency_contacts_personId_idx" ON "emergency_contacts"("personId");

-- CreateIndex
CREATE INDEX "person_certificates_personId_idx" ON "person_certificates"("personId");

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_certificates" ADD CONSTRAINT "person_certificates_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
