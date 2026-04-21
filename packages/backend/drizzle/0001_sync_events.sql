CREATE TABLE IF NOT EXISTS "sync_events" (
  "id" SERIAL PRIMARY KEY,
  "config_id" TEXT NOT NULL REFERENCES "app_configs"("id") ON DELETE CASCADE,
  "status" VARCHAR(20) NOT NULL,
  "pushed" INTEGER NOT NULL DEFAULT 0,
  "pulled" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "triggered_by" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_sync_events_config_id" ON "sync_events" ("config_id");
CREATE INDEX IF NOT EXISTS "idx_sync_events_created_at" ON "sync_events" ("created_at" DESC);
