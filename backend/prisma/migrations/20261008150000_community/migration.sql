-- Explore's Community: publications (writings and voice clips), hearts, reports, blocks, pen names, the monthly contest and its prizes; listened seconds per document for contest votes
-- CreateEnum
CREATE TYPE "PublicationKind" AS ENUM ('WRITING', 'CLIP');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('CHECKING', 'LIVE', 'HIDDEN', 'REJECTED', 'REMOVED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "communityRulesAt" TIMESTAMP(3),
ADD COLUMN     "penName" TEXT,
ADD COLUMN     "penNameKey" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "publicationId" TEXT;

-- AlterTable
ALTER TABLE "playback_states" ADD COLUMN     "listenedSec" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PublicationKind" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'CHECKING',
    "statusNote" TEXT,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "text" TEXT,
    "credit" TEXT,
    "charCount" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "sourceId" TEXT,
    "masterId" TEXT,
    "blobHash" TEXT,
    "contestMonth" TEXT,
    "hearts" INTEGER NOT NULL DEFAULT 0,
    "listens" INTEGER NOT NULL DEFAULT 0,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_votes" (
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_votes_pkey" PRIMARY KEY ("publicationId","userId")
);

-- CreateTable
CREATE TABLE "publication_reports" (
    "publicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_reports_pkey" PRIMARY KEY ("publicationId","userId")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "userId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("userId","blockedId")
);

-- CreateTable
CREATE TABLE "contests" (
    "month" TEXT NOT NULL,
    "theme" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "contest_wins" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "publicationId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "penName" TEXT NOT NULL,
    "hearts" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_wins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publications_masterId_key" ON "publications"("masterId");

-- CreateIndex
CREATE INDEX "publications_status_kind_publishedAt_idx" ON "publications"("status", "kind", "publishedAt");

-- CreateIndex
CREATE INDEX "publications_contestMonth_status_idx" ON "publications"("contestMonth", "status");

-- CreateIndex
CREATE INDEX "publications_userId_createdAt_idx" ON "publications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "publications_sourceId_idx" ON "publications"("sourceId");

-- CreateIndex
CREATE INDEX "publications_blobHash_idx" ON "publications"("blobHash");

-- CreateIndex
CREATE UNIQUE INDEX "publications_userId_contestMonth_key" ON "publications"("userId", "contestMonth");

-- CreateIndex
CREATE INDEX "publication_votes_userId_idx" ON "publication_votes"("userId");

-- CreateIndex
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");

-- CreateIndex
CREATE INDEX "contest_wins_userId_idx" ON "contest_wins"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_wins_month_board_place_key" ON "contest_wins"("month", "board", "place");

-- CreateIndex
CREATE UNIQUE INDEX "users_penNameKey_key" ON "users"("penNameKey");

-- CreateIndex
CREATE INDEX "documents_publicationId_idx" ON "documents"("publicationId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_blobHash_fkey" FOREIGN KEY ("blobHash") REFERENCES "audio_blobs"("hash") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_votes" ADD CONSTRAINT "publication_votes_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_votes" ADD CONSTRAINT "publication_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_reports" ADD CONSTRAINT "publication_reports_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_reports" ADD CONSTRAINT "publication_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_wins" ADD CONSTRAINT "contest_wins_month_fkey" FOREIGN KEY ("month") REFERENCES "contests"("month") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_wins" ADD CONSTRAINT "contest_wins_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_wins" ADD CONSTRAINT "contest_wins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

