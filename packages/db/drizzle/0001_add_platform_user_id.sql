-- Add platform_user_id column to link orchestrator users with Osool Platform accounts
ALTER TABLE "users" ADD COLUMN "platform_user_id" varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS "users_platform_user_id_unique" ON "users" ("platform_user_id");
