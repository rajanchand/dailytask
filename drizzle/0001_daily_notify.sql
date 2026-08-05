ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "daily_notify" boolean DEFAULT false NOT NULL;
