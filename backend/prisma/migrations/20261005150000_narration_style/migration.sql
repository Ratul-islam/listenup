-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "narrationBrief" JSONB,
ADD COLUMN     "narrationStrength" TEXT,
ADD COLUMN     "narrationStyle" TEXT;

-- AlterTable
ALTER TABLE "document_chunks" ADD COLUMN     "narration" TEXT;
