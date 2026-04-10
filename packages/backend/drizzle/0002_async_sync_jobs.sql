ALTER TABLE "sync_events" ADD COLUMN IF NOT EXISTS "job_id" TEXT UNIQUE;
ALTER TABLE "sync_events" ADD COLUMN IF NOT EXISTS "phase" VARCHAR(20);
ALTER TABLE "sync_events" ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ;
ALTER TABLE "sync_events" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ;
ALTER TABLE "sync_events" ADD COLUMN IF NOT EXISTS "error_message" TEXT;

CREATE INDEX IF NOT EXISTS "idx_sync_events_job_id" ON "sync_events" ("job_id") WHERE "job_id" IS NOT NULL;
