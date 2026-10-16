CREATE SCHEMA "budgets";
--> statement-breakpoint
CREATE TABLE "budgets"."budgets" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"category_kind" text NOT NULL,
	"period" text NOT NULL,
	"currency" char(3) NOT NULL,
	"carryover" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "budgets_expense" CHECK ("budgets"."budgets"."category_kind" = 'expense'),
	CONSTRAINT "budgets_period" CHECK ("budgets"."budgets"."period" in ('monthly', 'quarterly', 'yearly')),
	CONSTRAINT "budgets_starts_on_period" CHECK (extract(day from "budgets"."budgets"."starts_on") = 1 and ("budgets"."budgets"."period" = 'monthly'
        or ("budgets"."budgets"."period" = 'quarterly' and extract(month from "budgets"."budgets"."starts_on") in (1, 4, 7, 10))
        or ("budgets"."budgets"."period" = 'yearly' and extract(month from "budgets"."budgets"."starts_on") = 1)))
);
--> statement-breakpoint
CREATE TABLE "budgets"."limits" (
	"user_id" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limits_user_id_budget_id_effective_from_pk" PRIMARY KEY("user_id","budget_id","effective_from"),
	CONSTRAINT "limits_amount" CHECK ("budgets"."limits"."amount_minor" > 0),
	CONSTRAINT "limits_first_day" CHECK (extract(day from "budgets"."limits"."effective_from") = 1)
);
--> statement-breakpoint
ALTER TABLE "budgets"."budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets"."budgets" ADD CONSTRAINT "budgets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets"."budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("user_id","category_id","category_kind") REFERENCES "categories"."categories"("user_id","id","kind") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "budgets"."limits" ADD CONSTRAINT "limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets"."limits" ADD CONSTRAINT "limits_budget_fk" FOREIGN KEY ("user_id","budget_id") REFERENCES "budgets"."budgets"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_one_per_category" ON "budgets"."budgets" USING btree ("user_id","category_id") WHERE "budgets"."budgets"."archived_at" is null;