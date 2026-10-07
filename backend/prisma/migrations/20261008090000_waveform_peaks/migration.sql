-- Studio waveforms: each shared audio file's loudness in 48 slices, measured once
-- AlterTable
ALTER TABLE "audio_blobs" ADD COLUMN     "peaks" JSONB;
