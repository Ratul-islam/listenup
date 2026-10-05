-- AlterTable
ALTER TABLE "users" ADD COLUMN     "billingCountry" TEXT,
ADD COLUMN     "bonusExpressiveSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expressiveTrialUsedSec" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "audio_clips" ADD COLUMN     "blobHash" TEXT;

-- AlterTable
ALTER TABLE "usage_months" ADD COLUMN     "expressiveSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "naturalSec" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "audio_blobs" (
    "hash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_blobs_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "spend_days" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "characters" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "spend_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spend_days_day_bucket_model_key" ON "spend_days"("day", "bucket", "model");

-- CreateIndex
CREATE INDEX "audio_clips_blobHash_idx" ON "audio_clips"("blobHash");

-- AddForeignKey
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_blobHash_fkey" FOREIGN KEY ("blobHash") REFERENCES "audio_blobs"("hash") ON DELETE SET NULL ON UPDATE CASCADE;

