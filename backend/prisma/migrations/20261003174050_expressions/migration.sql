-- CreateEnum
CREATE TYPE "AutoExpressionStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "audio_clips" ADD COLUMN     "renderKey" TEXT,
ADD COLUMN     "timings" JSONB;

-- AlterTable
ALTER TABLE "document_chunks" ADD COLUMN     "expressions" JSONB;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "autoExpression" "AutoExpressionStatus";
