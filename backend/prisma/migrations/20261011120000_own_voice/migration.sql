-- Own voice (Pro): one cloned voice per account, with the recordings it was made from
-- CreateTable
CREATE TABLE "own_voices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerVoiceId" TEXT,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "consentLanguage" TEXT,
    "consentedAt" TIMESTAMP(3),
    "sourceKey" TEXT,
    "consentKey" TEXT,
    "providerCreatedAt" TIMESTAMP(3),
    "attemptsPeriod" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "own_voices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "own_voices_userId_key" ON "own_voices"("userId");

-- AddForeignKey
ALTER TABLE "own_voices" ADD CONSTRAINT "own_voices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
