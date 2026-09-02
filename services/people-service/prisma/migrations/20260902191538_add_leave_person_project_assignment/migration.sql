-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "leaveType" TEXT,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_project_assignments" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "projectName" TEXT NOT NULL,
    "role" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "person_project_assignments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_project_assignments" ADD CONSTRAINT "person_project_assignments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
