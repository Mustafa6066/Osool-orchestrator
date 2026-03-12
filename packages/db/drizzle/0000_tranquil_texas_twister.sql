CREATE TABLE IF NOT EXISTS "campaign_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"spend" numeric(12, 2) DEFAULT '0',
	"revenue" numeric(12, 2) DEFAULT '0',
	"ctr" numeric(8, 4),
	"cpc" numeric(10, 2),
	"cpa" numeric(10, 2),
	"roas" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"external_id" varchar(255),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"objective" varchar(100),
	"icp_segment" varchar(50),
	"budget_daily" numeric(12, 2),
	"budget_total" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'EGP',
	"targeting" jsonb,
	"creative_assets" jsonb,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"intent_type" varchar(50),
	"intent_entities" jsonb,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"visitor_id" varchar(255),
	"icp_segment" varchar(50),
	"language" varchar(5) DEFAULT 'en',
	"message_count" integer DEFAULT 0,
	"lead_score" integer DEFAULT 0,
	"summary" text,
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "developers" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_ar" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"founded" integer,
	"project_count" integer DEFAULT 0,
	"avg_delivery_rate_percent" integer,
	"avg_price_per_sqm" integer,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"tier" varchar(50),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid,
	"user_id" uuid,
	"email" varchar(320) NOT NULL,
	"subject" varchar(1000),
	"step_index" integer DEFAULT 0,
	"step_number" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(255),
	"external_id" varchar(255),
	"error" text,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"tier" varchar(50),
	"icp_segment" varchar(50),
	"trigger_score" integer DEFAULT 60,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_loop_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(50) DEFAULT 'system' NOT NULL,
	"event_type" varchar(100) DEFAULT 'loop_run' NOT NULL,
	"loop_type" varchar(100),
	"entity_id" varchar(255),
	"entity_type" varchar(100),
	"actions_triggered" integer DEFAULT 0,
	"data" jsonb,
	"summary" jsonb,
	"processed_at" timestamp with time zone,
	"run_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"visitor_id" varchar(255),
	"session_id" varchar(255),
	"event" varchar(100) NOT NULL,
	"stage" varchar(50) NOT NULL,
	"properties" jsonb,
	"source" varchar(100),
	"medium" varchar(100),
	"campaign" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intent_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(255),
	"visitor_id" varchar(255),
	"anonymous_id" varchar(255),
	"user_id" uuid,
	"intent_type" varchar(50) NOT NULL,
	"confidence" integer DEFAULT 50,
	"entities" jsonb,
	"segment" varchar(50),
	"raw_query" text,
	"message" text,
	"page_context" jsonb,
	"source" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" varchar(500) NOT NULL,
	"keyword_ar" varchar(500),
	"slug" varchar(500) NOT NULL,
	"cluster" varchar(200),
	"search_volume" integer DEFAULT 0,
	"difficulty" integer DEFAULT 0,
	"cpc_egp" numeric(10, 2),
	"intent" varchar(50),
	"language" varchar(5) DEFAULT 'en',
	"last_updated" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keywords_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" varchar(100) NOT NULL,
	"project_name" varchar(500) NOT NULL,
	"project_name_ar" varchar(500),
	"slug" varchar(500) NOT NULL,
	"property_type" varchar(100) NOT NULL,
	"location" varchar(255) NOT NULL,
	"location_ar" varchar(255),
	"region" varchar(100),
	"price_min" numeric(15, 2),
	"price_max" numeric(15, 2),
	"area_min" integer,
	"area_max" integer,
	"bedrooms" integer,
	"bathrooms" integer,
	"delivery_date" varchar(50),
	"installment_years" integer,
	"down_payment_percent" integer,
	"description" text,
	"description_ar" text,
	"amenities" jsonb DEFAULT '[]'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"nawy_url" text,
	"featured" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retargeting_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(500) NOT NULL,
	"audience_name" varchar(500),
	"platform" varchar(50) NOT NULL,
	"external_id" varchar(255),
	"platform_audience_id" varchar(255),
	"segment" varchar(50),
	"rules" jsonb DEFAULT '[]'::jsonb,
	"estimated_size" integer,
	"member_count" integer DEFAULT 0,
	"active" boolean DEFAULT true,
	"status" varchar(50) DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_type" varchar(100) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" varchar(500) NOT NULL,
	"meta_description" text,
	"description" text,
	"h1" varchar(500),
	"body" text NOT NULL,
	"schema_markup" jsonb,
	"generation_prompt_key" varchar(255),
	"word_count" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(1000) NOT NULL,
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"title" varchar(500) NOT NULL,
	"meta_description" text,
	"h1" varchar(500),
	"content" text,
	"page_type" varchar(100) NOT NULL,
	"keyword_id" uuid,
	"schema_markup" jsonb,
	"published" boolean DEFAULT false,
	"indexable" boolean DEFAULT true,
	"chat_conversion_rate" numeric(5, 2) DEFAULT '0',
	"impressions" integer DEFAULT 0,
	"last_regenerated" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_pages_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" varchar(255),
	"email" varchar(320),
	"name" varchar(255),
	"role" varchar(50) DEFAULT 'visitor' NOT NULL,
	"icp_segment" varchar(50),
	"language" varchar(5) DEFAULT 'en',
	"metadata" jsonb,
	"email_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" varchar(320) NOT NULL,
	"name" varchar(255),
	"phone" varchar(50),
	"source" varchar(100),
	"icp_segment" varchar(50),
	"lead_score" integer,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb,
	"budget_range" jsonb,
	"notes" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_sequence_id_email_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intent_signals" ADD CONSTRAINT "intent_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "properties" ADD CONSTRAINT "properties_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seo_pages" ADD CONSTRAINT "seo_pages_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_metrics_campaign_date" ON "campaign_metrics" USING btree ("campaign_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_platform" ON "campaigns" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_segment" ON "campaigns" USING btree ("icp_segment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_session" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_user" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_visitor" ON "chat_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_sessions_score" ON "chat_sessions" USING btree ("lead_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_sends_user" ON "email_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_sends_status" ON "email_sends" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_source" ON "feedback_loop_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_event_type" ON "feedback_loop_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_events_user" ON "funnel_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_events_visitor" ON "funnel_events" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_events_stage" ON "funnel_events" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_events_event" ON "funnel_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_events_created" ON "funnel_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_intent_visitor" ON "intent_signals" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_intent_session" ON "intent_signals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_intent_type" ON "intent_signals" USING btree ("intent_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_keywords_cluster" ON "keywords" USING btree ("cluster");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_keywords_intent" ON "keywords" USING btree ("intent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_developer" ON "properties" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_location" ON "properties" USING btree ("location");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_type" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_properties_price" ON "properties" USING btree ("price_min","price_max");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_content_type_slug" ON "seo_content" USING btree ("page_type","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_content_locale" ON "seo_content" USING btree ("locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_content_status" ON "seo_content" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_pages_path" ON "seo_pages" USING btree ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_seo_pages_type" ON "seo_pages" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_email" ON "waitlist" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_waitlist_score" ON "waitlist" USING btree ("lead_score");