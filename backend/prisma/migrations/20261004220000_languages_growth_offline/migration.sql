-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "keepClutter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languageHint" TEXT,
ADD COLUMN     "translatedFromId" TEXT;

-- AlterTable
ALTER TABLE "usage_months" ADD COLUMN     "translatedChars" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: one voice per language instead of an English and a Bangla column.
-- Existing choices are copied before the old columns go.
ALTER TABLE "user_preferences" ADD COLUMN     "voices" JSONB NOT NULL DEFAULT '{}';
UPDATE "user_preferences"
SET "voices" = jsonb_strip_nulls(jsonb_build_object('en', "voiceEnId", 'bn', "voiceBnId"));
ALTER TABLE "user_preferences" DROP COLUMN "voiceBnId",
DROP COLUMN "voiceEnId";

-- CreateTable
CREATE TABLE "offline_downloads" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'RUNNING',
    "renderKey" TEXT NOT NULL,
    "voiceId" TEXT,
    "jobId" TEXT,
    "chunksDone" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offline_downloads_documentId_key" ON "offline_downloads"("documentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_translatedFromId_fkey" FOREIGN KEY ("translatedFromId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_downloads" ADD CONSTRAINT "offline_downloads_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

