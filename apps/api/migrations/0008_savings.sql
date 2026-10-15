CREATE SCHEMA "savings";
--> statement-breakpoint
CREATE TABLE "savings"."allocations" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"account_kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"transaction_id" uuid,
	"note" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "allocations_one_per_transaction" UNIQUE("user_id","transaction_id"),
	CONSTRAINT "allocations_asset" CHECK ("savings"."allocations"."account_kind" = 'asset'),
	CONSTRAINT "allocations_amount" CHECK ("savings"."allocations"."amount_minor" <> 0),
	CONSTRAINT "allocations_note" CHECK ("savings"."allocations"."note" is null or length(trim("savings"."allocations"."note")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "savings"."goals" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"target_minor" bigint NOT NULL,
	"target_date" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "goals_target" CHECK ("savings"."goals"."target_minor" > 0),
	CONSTRAINT "goals_name" CHECK (length(trim("savings"."goals"."name")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "savings"."allocations" ADD CONSTRAINT "allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings"."allocations" ADD CONSTRAINT "allocations_goal_fk" FOREIGN KEY ("user_id","goal_id") REFERENCES "savings"."goals"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings"."allocations" ADD CONSTRAINT "allocations_account_fk" FOREIGN KEY ("user_id","account_id","currency","account_kind") REFERENCES "ledger"."accounts"("user_id","id","currency","kind") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "savings"."allocations" ADD CONSTRAINT "allocations_transaction_fk" FOREIGN KEY ("user_id","transaction_id") REFERENCES "ledger"."transactions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings"."goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_by_goal" ON "savings"."allocations" USING btree ("user_id","goal_id");--> statement-breakpoint
CREATE INDEX "allocations_by_account" ON "savings"."allocations" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goals_unique_name" ON "savings"."goals" USING btree ("user_id",lower("name")) WHERE "savings"."goals"."archived_at" is null;