CREATE SCHEMA "currency";
--> statement-breakpoint
CREATE TABLE "currency"."currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"minor_units" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency"."provider_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"valid_from" date NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "provider_rates_supersedesId_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "provider_rates_id_source_base_quote_unique" UNIQUE("id","source","base","quote"),
	CONSTRAINT "provider_rates_positive" CHECK ("currency"."provider_rates"."rate" > 0),
	CONSTRAINT "provider_rates_pair" CHECK ("currency"."provider_rates"."base" <> "currency"."provider_rates"."quote")
);
--> statement-breakpoint
CREATE TABLE "currency"."user_rates" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"valid_from" date NOT NULL,
	"rate" numeric(38, 18) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	"note" text,
	CONSTRAINT "user_rates_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "user_rates_userId_id_base_quote_unique" UNIQUE("user_id","id","base","quote"),
	CONSTRAINT "user_rates_userId_supersedesId_unique" UNIQUE("user_id","supersedes_id"),
	CONSTRAINT "user_rates_positive" CHECK ("currency"."user_rates"."rate" > 0),
	CONSTRAINT "user_rates_pair" CHECK ("currency"."user_rates"."base" <> "currency"."user_rates"."quote")
);
--> statement-breakpoint
ALTER TABLE "currency"."provider_rates" ADD CONSTRAINT "provider_rates_base_currencies_code_fk" FOREIGN KEY ("base") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."provider_rates" ADD CONSTRAINT "provider_rates_quote_currencies_code_fk" FOREIGN KEY ("quote") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."provider_rates" ADD CONSTRAINT "provider_rates_revision_fk" FOREIGN KEY ("supersedes_id","source","base","quote") REFERENCES "currency"."provider_rates"("id","source","base","quote") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."user_rates" ADD CONSTRAINT "user_rates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."user_rates" ADD CONSTRAINT "user_rates_base_currencies_code_fk" FOREIGN KEY ("base") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."user_rates" ADD CONSTRAINT "user_rates_quote_currencies_code_fk" FOREIGN KEY ("quote") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency"."user_rates" ADD CONSTRAINT "user_rates_revision_fk" FOREIGN KEY ("user_id","supersedes_id","base","quote") REFERENCES "currency"."user_rates"("user_id","id","base","quote") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_rates_base_quote_valid_from_index" ON "currency"."provider_rates" USING btree ("base","quote","valid_from");--> statement-breakpoint
CREATE INDEX "user_rates_user_id_base_quote_valid_from_index" ON "currency"."user_rates" USING btree ("user_id","base","quote","valid_from");--> statement-breakpoint
-- Supported currencies (must match the kernel's table; a test checks it).
INSERT INTO "currency"."currencies" ("code", "minor_units") VALUES ('USD', 2), ('EUR', 2), ('COP', 2), ('MXN', 2);
--> statement-breakpoint
-- Rates are immutable revisions: corrections insert a new row that supersedes the old one.
-- User rates may only disappear with their owner (account deletion cascade).
CREATE FUNCTION "currency"."rates_are_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'user_rates'
     AND NOT EXISTS (SELECT 1 FROM "identity"."users" WHERE "id" = OLD."user_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'exchange rates are immutable; insert a revision instead'
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "provider_rates_immutable" BEFORE UPDATE OR DELETE ON "currency"."provider_rates"
  FOR EACH ROW EXECUTE FUNCTION "currency"."rates_are_immutable"();
--> statement-breakpoint
CREATE TRIGGER "user_rates_immutable" BEFORE UPDATE OR DELETE ON "currency"."user_rates"
  FOR EACH ROW EXECUTE FUNCTION "currency"."rates_are_immutable"();
