-- AlterTable
ALTER TABLE "users" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planRenews" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "studio_pack_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_pack_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_pack_purchases_userId_idx" ON "studio_pack_purchases"("userId");

-- AddForeignKey
ALTER TABLE "studio_pack_purchases" ADD CONSTRAINT "studio_pack_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

