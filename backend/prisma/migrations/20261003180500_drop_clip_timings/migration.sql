-- Stitched multi-segment clips were dropped in favour of one request per chunk
ALTER TABLE "audio_clips" DROP COLUMN "timings";
