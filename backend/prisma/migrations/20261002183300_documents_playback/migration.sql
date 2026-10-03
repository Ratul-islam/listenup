-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PDF', 'DOCX', 'EPUB', 'TEXT', 'MARKDOWN', 'WEB', 'IMAGE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AudioStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sourceUrl" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "language" TEXT,
    "excerpt" TEXT,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedDurationSec" INTEGER NOT NULL DEFAULT 0,
    "usedOcr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sentences" JSONB NOT NULL,
    "estimatedDurationSec" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_clips" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "status" "AudioStatus" NOT NULL DEFAULT 'GENERATING',
    "storageKey" TEXT,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playback_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "offsetMs" INTEGER NOT NULL DEFAULT 0,
    "voiceId" TEXT,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playback_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "offsetMs" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listening_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_months" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "characters" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" TEXT NOT NULL,
    "voiceEnId" TEXT,
    "voiceBnId" TEXT,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "documents_userId_createdAt_idx" ON "documents"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_documentId_index_key" ON "document_chunks"("documentId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "audio_clips_chunkId_voiceId_key" ON "audio_clips"("chunkId", "voiceId");

-- CreateIndex
CREATE UNIQUE INDEX "playback_states_userId_documentId_key" ON "playback_states"("userId", "documentId");

-- CreateIndex
CREATE INDEX "bookmarks_userId_documentId_idx" ON "bookmarks"("userId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "listening_days_userId_day_key" ON "listening_days"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "usage_months_userId_period_key" ON "usage_months"("userId", "period");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_clips" ADD CONSTRAINT "audio_clips_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_states" ADD CONSTRAINT "playback_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_states" ADD CONSTRAINT "playback_states_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_days" ADD CONSTRAINT "listening_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_months" ADD CONSTRAINT "usage_months_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
