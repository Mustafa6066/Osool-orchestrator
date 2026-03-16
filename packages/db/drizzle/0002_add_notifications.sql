CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "title_ar" varchar(255),
  "body" text NOT NULL,
  "body_ar" text,
  "data" jsonb,
  "read" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user_read" ON "notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "idx_notifications_created" ON "notifications" ("created_at" DESC);
