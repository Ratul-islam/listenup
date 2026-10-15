-- Security fixes (15 October 2026): one key per real inbox, so Gmail dots and "+tags" can't make
-- many accounts for invite and contest rewards, and the moment listening was last credited up to,
-- so reported listening can't add up faster than the clock. Additive only: two nullable columns.

ALTER TABLE "users" ADD COLUMN "emailKey" TEXT;
ALTER TABLE "users" ADD COLUMN "listenCreditedUntil" TIMESTAMP(3);

-- Same rule as utils/email-key.ts: lower case, "+tag" dropped (unless nothing comes before it),
-- googlemail.com read as gmail.com, and Gmail's dots dropped
UPDATE "users" u SET "emailKey" = k.local || '@' || k.domain
FROM (
  SELECT id, domain,
    CASE WHEN domain = 'gmail.com' THEN COALESCE(NULLIF(replace(base, '.', ''), ''), base) ELSE base END AS local
  FROM (
    SELECT id, domain, COALESCE(NULLIF(split_part(local, '+', 1), ''), local) AS base
    FROM (
      SELECT id,
        substring(lower(trim(email)) from '^(.*)@[^@]*$') AS local,
        CASE WHEN substring(lower(trim(email)) from '@([^@]*)$') = 'googlemail.com' THEN 'gmail.com'
             ELSE substring(lower(trim(email)) from '@([^@]*)$') END AS domain
      FROM "users"
    ) parts
    WHERE local IS NOT NULL AND local <> ''
  ) based
) k
WHERE u.id = k.id;

CREATE INDEX "users_emailKey_idx" ON "users"("emailKey");
