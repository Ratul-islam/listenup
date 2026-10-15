-- Each Free account's share of the Free budget (15 October 2026): what it spent per day, so one
-- account can't use up the shared daily budget for every Free user. Additive only: one new table.

CREATE TABLE "user_spend_days" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "costMicros" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_spend_days_pkey" PRIMARY KEY ("userId","day")
);

ALTER TABLE "user_spend_days" ADD CONSTRAINT "user_spend_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
