CREATE SCHEMA "debts";
--> statement-breakpoint
CREATE TABLE "debts"."debt_payments" (
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	CONSTRAINT "debt_payments_user_id_transaction_id_pk" PRIMARY KEY("user_id","transaction_id")
);
--> statement-breakpoint
CREATE TABLE "debts"."debts" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"account_kind" text NOT NULL,
	"type" text NOT NULL,
	"rate" numeric(20, 12),
	"rate_period" text,
	"original_principal_minor" bigint,
	"term_months" integer,
	"installment_minor" bigint,
	"start_on" date,
	"due_day" smallint,
	"statement_day" smallint,
	"credit_limit_minor" bigint,
	"interest_category_id" uuid,
	"interest_category_kind" text GENERATED ALWAYS AS ('expense') STORED,
	"rounding_minor" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "debts_one_per_account" UNIQUE("user_id","account_id"),
	CONSTRAINT "debts_liability" CHECK ("debts"."debts"."account_kind" = 'liability'),
	CONSTRAINT "debts_type" CHECK ("debts"."debts"."type" in ('loan', 'credit_card')),
	CONSTRAINT "debts_rate" CHECK (("debts"."debts"."rate" is null) = ("debts"."debts"."rate_period" is null) and ("debts"."debts"."rate" is null or "debts"."debts"."rate" >= 0)),
	CONSTRAINT "debts_days" CHECK (("debts"."debts"."due_day" is null or "debts"."debts"."due_day" between 1 and 31) and ("debts"."debts"."statement_day" is null or "debts"."debts"."statement_day" between 1 and 31)),
	CONSTRAINT "debts_term" CHECK ("debts"."debts"."term_months" is null or "debts"."debts"."term_months" between 1 and 600),
	CONSTRAINT "debts_rounding" CHECK ("debts"."debts"."rounding_minor" >= 1),
	CONSTRAINT "debts_amounts" CHECK (("debts"."debts"."original_principal_minor" is null or "debts"."debts"."original_principal_minor" > 0)
      and ("debts"."debts"."installment_minor" is null or "debts"."debts"."installment_minor" > 0)
      and ("debts"."debts"."credit_limit_minor" is null or "debts"."debts"."credit_limit_minor" > 0))
);
--> statement-breakpoint
ALTER TABLE "debts"."debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts"."debt_payments" ADD CONSTRAINT "debt_payments_debt_fk" FOREIGN KEY ("user_id","debt_id") REFERENCES "debts"."debts"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts"."debt_payments" ADD CONSTRAINT "debt_payments_transaction_fk" FOREIGN KEY ("user_id","transaction_id") REFERENCES "ledger"."transactions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts"."debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts"."debts" ADD CONSTRAINT "debts_account_fk" FOREIGN KEY ("user_id","account_id","currency","account_kind") REFERENCES "ledger"."accounts"("user_id","id","currency","kind") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "debts"."debts" ADD CONSTRAINT "debts_interest_category_fk" FOREIGN KEY ("user_id","interest_category_id","interest_category_kind") REFERENCES "categories"."categories"("user_id","id","kind") ON DELETE no action ON UPDATE restrict;