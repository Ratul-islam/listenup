
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "podcastAddedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "usage_months" ADD COLUMN     "bonusNaturalSec" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "inviteRewardedAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "podcastToken" TEXT;

-- CreateTable
CREATE TABLE "ad_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "transactionId" TEXT,
    "seconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_rewards_transactionId_key" ON "ad_rewards"("transactionId");

-- CreateIndex
CREATE INDEX "ad_rewards_userId_day_idx" ON "ad_rewards"("userId", "day");

-- CreateIndex
CREATE INDEX "documents_userId_podcastAddedAt_idx" ON "documents"("userId", "podcastAddedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_inviteCode_key" ON "users"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_podcastToken_key" ON "users"("podcastToken");

-- CreateIndex
CREATE INDEX "users_invitedById_idx" ON "users"("invitedById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

