CREATE SCHEMA "recurring";
--> statement-breakpoint
CREATE TABLE "recurring"."occurrences" (
	"user_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"status" text NOT NULL,
	"transaction_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrences_user_id_rule_id_due_on_pk" PRIMARY KEY("user_id","rule_id","due_on"),
	CONSTRAINT "occurrences_one_per_transaction" UNIQUE("user_id","transaction_id"),
	CONSTRAINT "occurrences_status" CHECK ("recurring"."occurrences"."status" in ('pending', 'posted', 'skipped')),
	CONSTRAINT "occurrences_posted" CHECK (("recurring"."occurrences"."status" = 'posted') = ("recurring"."occurrences"."transaction_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "recurring"."rules" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"template" jsonb NOT NULL,
	"frequency" text NOT NULL,
	"anchor_on" date NOT NULL,
	"second_day" smallint,
	"next_due_on" date NOT NULL,
	"ends_on" date,
	"confirm" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rules_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "rules_frequency" CHECK ("recurring"."rules"."frequency" in ('monthly', 'twice_monthly', 'weekly', 'yearly')),
	CONSTRAINT "rules_second_day" CHECK (("recurring"."rules"."frequency" = 'twice_monthly') = ("recurring"."rules"."second_day" is not null)
        and ("recurring"."rules"."second_day" is null or "recurring"."rules"."second_day" between 1 and 31)),
	CONSTRAINT "rules_template_kind" CHECK ("recurring"."rules"."template"->>'kind' in ('income', 'expense', 'transfer'))
);
--> statement-breakpoint
ALTER TABLE "recurring"."occurrences" ADD CONSTRAINT "occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring"."occurrences" ADD CONSTRAINT "occurrences_rule_fk" FOREIGN KEY ("user_id","rule_id") REFERENCES "recurring"."rules"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring"."occurrences" ADD CONSTRAINT "occurrences_transaction_fk" FOREIGN KEY ("user_id","transaction_id") REFERENCES "ledger"."transactions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring"."rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "occurrences_pending" ON "recurring"."occurrences" USING btree ("user_id","due_on") WHERE "recurring"."occurrences"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "rules_due" ON "recurring"."rules" USING btree ("user_id","next_due_on");