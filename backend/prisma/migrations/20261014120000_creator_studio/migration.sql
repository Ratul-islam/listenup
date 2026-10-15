-- Creator studio (14 October 2026): a script's platform, narration type and voice settings,
-- the voice settings copied to its parts, and speakers' voices cloned for voice translation.
-- Additive only: two nullable columns and one new table.

ALTER TABLE "documents" ADD COLUMN "studio" JSONB;

ALTER TABLE "document_chunks" ADD COLUMN "delivery" JSONB;

CREATE TABLE "speaker_voices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "providerVoiceId" TEXT,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "consentLanguage" TEXT,
    "consentedAt" TIMESTAMP(3),
    "sourceKey" TEXT,
    "consentKey" TEXT,
    "providerCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaker_voices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "speaker_voices_documentId_key" ON "speaker_voices"("documentId");
CREATE INDEX "speaker_voices_userId_idx" ON "speaker_voices"("userId");

ALTER TABLE "speaker_voices" ADD CONSTRAINT "speaker_voices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "speaker_voices" ADD CONSTRAINT "speaker_voices_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
