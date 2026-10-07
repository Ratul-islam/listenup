-- Creator studio: scripts, edited parts, takes and sentence takes, part voices, pauses and locks, pronunciations, subtitle pauses
-- AlterTable
ALTER TABLE "audio_blobs" ADD COLUMN     "pauses" JSONB;

-- AlterTable
ALTER TABLE "audio_clips" ADD COLUMN     "baseKey" TEXT,
ADD COLUMN     "sentenceTakes" JSONB;

-- AlterTable
ALTER TABLE "document_chunks" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedLexicon" JSONB,
ADD COLUMN     "pauseAfterMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentenceTakes" JSONB,
ADD COLUMN     "take" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voiceId" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "isScript" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voicedSec" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pronunciations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "sayAs" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pronunciations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pronunciations_userId_word_key" ON "pronunciations"("userId", "word");

-- CreateIndex
CREATE INDEX "documents_userId_isScript_createdAt_idx" ON "documents"("userId", "isScript", "createdAt");

-- AddForeignKey
ALTER TABLE "pronunciations" ADD CONSTRAINT "pronunciations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

