-- Margin fixes: a time zone per user (Free users' region for ad and invite rewards), and monthly OCR-page and digest counters (Free caps)
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "timeZone" TEXT;

-- AlterTable
ALTER TABLE "usage_months" ADD COLUMN     "digests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ocrPages" INTEGER NOT NULL DEFAULT 0;

