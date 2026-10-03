-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('RUNNING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "audio_exports" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'RUNNING',
    "renderKey" TEXT NOT NULL,
    "voiceId" TEXT,
    "chunksDone" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_exports_documentId_key" ON "audio_exports"("documentId");

-- AddForeignKey
ALTER TABLE "audio_exports" ADD CONSTRAINT "audio_exports_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
