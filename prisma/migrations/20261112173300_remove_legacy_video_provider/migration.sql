BEGIN;

ALTER TYPE "VideoProvider" RENAME TO "VideoProvider_old";

CREATE TYPE "VideoProvider" AS ENUM ('MEDIA_CORE', 'UNSUPPORTED');

ALTER TABLE "VideoAsset"
ALTER COLUMN "provider" TYPE "VideoProvider"
USING CASE
  WHEN "provider"::text = 'MEDIA_CORE' THEN 'MEDIA_CORE'::"VideoProvider"
  ELSE 'UNSUPPORTED'::"VideoProvider"
END;

DROP TYPE "VideoProvider_old";

UPDATE "WebhookEvent"
SET "provider" = 'UNSUPPORTED'
WHERE "provider" = 'CLOUDFLARE_STREAM';

COMMIT;
