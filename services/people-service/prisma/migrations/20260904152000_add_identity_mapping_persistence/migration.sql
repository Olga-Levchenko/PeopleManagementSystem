-- CreateEnum
CREATE TYPE "IdentityLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "IdentityLinkOperationType" AS ENUM ('LINK', 'REVOKE', 'RELINK');

-- CreateEnum
CREATE TYPE "IdentityLinkAuditAction" AS ENUM ('LINK', 'REVOKE', 'RELINK');

-- CreateTable
CREATE TABLE "person_external_identity_links" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "canonicalIssuer" TEXT NOT NULL,
    "opaqueSubject" TEXT NOT NULL,
    "status" "IdentityLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAtUtc" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAtUtc" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_external_identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_link_operations" (
    "operationId" UUID NOT NULL,
    "operationType" "IdentityLinkOperationType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "fingerprintKeyVersion" TEXT NOT NULL,
    "resultLinkId" UUID,
    "resultStatus" TEXT NOT NULL,
    "createdAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_link_operations_pkey" PRIMARY KEY ("operationId")
);

-- CreateTable
CREATE TABLE "identity_link_audits" (
    "auditId" UUID NOT NULL,
    "action" "IdentityLinkAuditAction" NOT NULL,
    "linkId" UUID,
    "personId" UUID NOT NULL,
    "canonicalIssuer" TEXT NOT NULL,
    "subjectFingerprint" TEXT NOT NULL,
    "fingerprintKeyVersion" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorIdentifier" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "occurredAtUtc" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_link_audits_pkey" PRIMARY KEY ("auditId")
);

-- AddForeignKey
ALTER TABLE "person_external_identity_links"
    ADD CONSTRAINT "person_external_identity_links_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_link_operations"
    ADD CONSTRAINT "identity_link_operations_resultLinkId_fkey"
    FOREIGN KEY ("resultLinkId") REFERENCES "person_external_identity_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_link_audits"
    ADD CONSTRAINT "identity_link_audits_linkId_fkey"
    FOREIGN KEY ("linkId") REFERENCES "person_external_identity_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_link_audits"
    ADD CONSTRAINT "identity_link_audits_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "person_external_identity_links_personId_status_idx"
    ON "person_external_identity_links"("personId", "status");

-- CreateIndex
CREATE INDEX "person_external_identity_links_canonicalIssuer_opaqueSubject_status_idx"
    ON "person_external_identity_links"("canonicalIssuer", "opaqueSubject", "status");

-- CreateIndex
CREATE UNIQUE INDEX "identity_link_operations_operationType_idempotencyKey_key"
    ON "identity_link_operations"("operationType", "idempotencyKey");

-- CreateIndex
CREATE INDEX "identity_link_operations_resultLinkId_idx"
    ON "identity_link_operations"("resultLinkId");

-- CreateIndex
CREATE INDEX "identity_link_audits_personId_occurredAtUtc_idx"
    ON "identity_link_audits"("personId", "occurredAtUtc");

-- CreateIndex
CREATE INDEX "identity_link_audits_linkId_occurredAtUtc_idx"
    ON "identity_link_audits"("linkId", "occurredAtUtc");

-- CreateIndex
CREATE INDEX "identity_link_audits_correlationId_idx"
    ON "identity_link_audits"("correlationId");

-- Refuse to create partial unique indexes when pre-existing active duplicate data exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "person_external_identity_links"
        WHERE "status" = 'ACTIVE'
        GROUP BY "canonicalIssuer", "opaqueSubject"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot create active identity uniqueness index: duplicate (canonicalIssuer, opaqueSubject) data exists; no automatic resolution was performed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "person_external_identity_links"
        WHERE "status" = 'ACTIVE'
        GROUP BY "personId", "canonicalIssuer"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Cannot create active identity uniqueness index: duplicate (personId, canonicalIssuer) data exists; no automatic resolution was performed';
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "person_external_identity_links_active_issuer_subject_key"
    ON "person_external_identity_links"("canonicalIssuer", "opaqueSubject")
    WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "person_external_identity_links_active_person_issuer_key"
    ON "person_external_identity_links"("personId", "canonicalIssuer")
    WHERE "status" = 'ACTIVE';
