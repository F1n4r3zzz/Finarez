CREATE SCHEMA "categories";
--> statement-breakpoint
CREATE TABLE "categories"."categories" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_root" boolean GENERATED ALWAYS AS (parent_id IS NULL) STORED,
	"parent_must_be_root" boolean GENERATED ALWAYS AS (true) STORED,
	CONSTRAINT "categories_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "categories_kind_key" UNIQUE("user_id","id","kind"),
	CONSTRAINT "categories_root_key" UNIQUE("user_id","id","kind","is_root"),
	CONSTRAINT "categories_kind" CHECK ("categories"."categories"."kind" in ('income', 'expense')),
	CONSTRAINT "categories_name" CHECK (length(trim("categories"."categories"."name")) between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "categories"."seeded_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories"."categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories"."categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("user_id","parent_id","kind","parent_must_be_root") REFERENCES "categories"."categories"("user_id","id","kind","is_root") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "categories"."seeded_users" ADD CONSTRAINT "seeded_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_unique_name" ON "categories"."categories" USING btree ("user_id","kind",coalesce("parent_id"::text, ''),lower("name")) WHERE "categories"."categories"."archived_at" is null;