-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "digestDay" TEXT;

-- CreateTable
CREATE TABLE "study_aids" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_aids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_aids_documentId_kind_key" ON "study_aids"("documentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "documents_userId_digestDay_key" ON "documents"("userId", "digestDay");

-- AddForeignKey
ALTER TABLE "study_aids" ADD CONSTRAINT "study_aids_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

