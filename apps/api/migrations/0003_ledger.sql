CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE TABLE "ledger"."accounts" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"currency" char(3) NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"opened_on" date NOT NULL,
	"archived_at" timestamp with time zone,
	"system_role" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "accounts_entry_key" UNIQUE("user_id","id","currency","kind"),
	CONSTRAINT "accounts_kind_shape" CHECK (("ledger"."accounts"."system_role" is null and "ledger"."accounts"."kind" = 'asset' and "ledger"."accounts"."subtype" in ('bank', 'cash', 'wallet', 'savings', 'investment', 'receivable', 'other_asset'))
       or ("ledger"."accounts"."system_role" is null and "ledger"."accounts"."kind" = 'liability' and "ledger"."accounts"."subtype" in ('credit_card', 'loan', 'payable', 'other_liability'))
       or ("ledger"."accounts"."system_role" = 'income' and "ledger"."accounts"."kind" = 'income' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" = 'expense' and "ledger"."accounts"."kind" = 'expense' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" in ('opening_balance', 'valuation') and "ledger"."accounts"."kind" = 'equity' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" = 'fx' and "ledger"."accounts"."kind" = 'clearing' and "ledger"."accounts"."subtype" is null)),
	CONSTRAINT "accounts_name" CHECK (length(trim("ledger"."accounts"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "ledger"."entries" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"account_id" uuid NOT NULL,
	"account_kind" text NOT NULL,
	"currency" char(3) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"category_id" uuid,
	"category_kind" text,
	"memo" text,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "entries_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "entries_amount" CHECK ("ledger"."entries"."amount_minor" <> 0),
	CONSTRAINT "entries_category_pair" CHECK (("ledger"."entries"."category_id" is null) = ("ledger"."entries"."category_kind" is null)),
	CONSTRAINT "entries_category_required" CHECK (("ledger"."entries"."account_kind" in ('income', 'expense')) = ("ledger"."entries"."category_id" is not null)),
	CONSTRAINT "entries_category_kind" CHECK ("ledger"."entries"."category_kind" is null or "ledger"."entries"."category_kind" = "ledger"."entries"."account_kind")
);
--> statement-breakpoint
CREATE TABLE "ledger"."transaction_audit" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reconciled_change" boolean DEFAULT false NOT NULL,
	CONSTRAINT "transaction_audit_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "transaction_audit_action" CHECK ("ledger"."transaction_audit"."action" in ('create', 'update', 'void', 'restore')),
	CONSTRAINT "transaction_audit_source" CHECK ("ledger"."transaction_audit"."source" in ('ui', 'import', 'recurring', 'debts', 'savings', 'investments', 'system'))
);
--> statement-breakpoint
CREATE TABLE "ledger"."transactions" (
	"user_id" text NOT NULL,
	"id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"managed_by" text,
	"description" text NOT NULL,
	"payee" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "transactions_dated_key" UNIQUE("user_id","id","occurred_on"),
	CONSTRAINT "transactions_kind" CHECK ("ledger"."transactions"."kind" in ('income', 'expense', 'transfer', 'adjustment', 'opening', 'valuation')),
	CONSTRAINT "transactions_status" CHECK ("ledger"."transactions"."status" in ('posted', 'void')),
	CONSTRAINT "transactions_managed_by" CHECK ("ledger"."transactions"."managed_by" is null or "ledger"."transactions"."managed_by" in ('debts', 'savings', 'investments', 'imports')),
	CONSTRAINT "transactions_version" CHECK ("ledger"."transactions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "ledger"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "currency"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_transaction_fk" FOREIGN KEY ("user_id","transaction_id","occurred_on") REFERENCES "ledger"."transactions"("user_id","id","occurred_on") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_account_fk" FOREIGN KEY ("user_id","account_id","currency","account_kind") REFERENCES "ledger"."accounts"("user_id","id","currency","kind") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger"."entries" ADD CONSTRAINT "entries_category_fk" FOREIGN KEY ("user_id","category_id","category_kind") REFERENCES "categories"."categories"("user_id","id","kind") ON DELETE no action ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger"."transaction_audit" ADD CONSTRAINT "transaction_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transaction_audit" ADD CONSTRAINT "transaction_audit_transaction_fk" FOREIGN KEY ("user_id","transaction_id") REFERENCES "ledger"."transactions"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_system_role" ON "ledger"."accounts" USING btree ("user_id","system_role","currency") WHERE "ledger"."accounts"."system_role" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_one_leg_per_account" ON "ledger"."entries" USING btree ("user_id","transaction_id","account_id") WHERE "ledger"."entries"."account_kind" in ('asset', 'liability');--> statement-breakpoint
CREATE INDEX "entries_user_id_account_id_occurred_on_index" ON "ledger"."entries" USING btree ("user_id","account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "entries_user_id_category_id_occurred_on_index" ON "ledger"."entries" USING btree ("user_id","category_id","occurred_on");--> statement-breakpoint
CREATE INDEX "entries_user_id_transaction_id_index" ON "ledger"."entries" USING btree ("user_id","transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_audit_user_id_transaction_id_version_index" ON "ledger"."transaction_audit" USING btree ("user_id","transaction_id","version");--> statement-breakpoint
CREATE INDEX "transactions_user_id_occurred_on_index" ON "ledger"."transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
-- Every writer of a transaction's entries locks its header first, so concurrent edits of one
-- transaction take turns (data-model §4.4). Use cases lock headers themselves, in id order,
-- before touching entries; this trigger is the backstop.
CREATE FUNCTION "ledger"."lock_transaction_headers"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD."user_id", OLD."transaction_id") IS DISTINCT FROM (NEW."user_id", NEW."transaction_id") THEN
    PERFORM 1 FROM "ledger"."transactions"
      WHERE ("user_id", "id") IN ((OLD."user_id", OLD."transaction_id"), (NEW."user_id", NEW."transaction_id"))
      ORDER BY "id" FOR UPDATE;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM "ledger"."transactions"
      WHERE "user_id" = OLD."user_id" AND "id" = OLD."transaction_id" FOR UPDATE;
  ELSE
    PERFORM 1 FROM "ledger"."transactions"
      WHERE "user_id" = NEW."user_id" AND "id" = NEW."transaction_id" FOR UPDATE;
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
CREATE TRIGGER "entries_lock_header" BEFORE INSERT OR UPDATE OR DELETE ON "ledger"."entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger"."lock_transaction_headers"();
--> statement-breakpoint
-- The ledger's invariant, checked at COMMIT: a posted transaction has at least two entries and
-- balances in every currency; a void one has none (ADR 0002).
CREATE FUNCTION "ledger"."check_transaction"(p_user text, p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_count integer;
  v_currency char(3);
BEGIN
  SELECT "status" INTO v_status FROM "ledger"."transactions" WHERE "user_id" = p_user AND "id" = p_id;
  IF NOT FOUND THEN
    RETURN; -- removed together with its owner
  END IF;
  SELECT count(*) INTO v_count FROM "ledger"."entries" WHERE "user_id" = p_user AND "transaction_id" = p_id;
  IF v_status = 'void' THEN
    IF v_count > 0 THEN
      RAISE EXCEPTION 'ledger: void transaction % still has entries', p_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  END IF;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'ledger: posted transaction % needs at least two entries', p_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT "currency" INTO v_currency FROM "ledger"."entries"
    WHERE "user_id" = p_user AND "transaction_id" = p_id
    GROUP BY "currency" HAVING sum("amount_minor") <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ledger: transaction % does not balance in %', p_id, v_currency
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "ledger"."validate_entry_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM "ledger"."check_transaction"(OLD."user_id", OLD."transaction_id");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM "ledger"."check_transaction"(NEW."user_id", NEW."transaction_id");
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "entries_balanced" AFTER INSERT OR UPDATE OR DELETE ON "ledger"."entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger"."validate_entry_change"();
--> statement-breakpoint
CREATE FUNCTION "ledger"."validate_transaction_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM "ledger"."check_transaction"(NEW."user_id", NEW."id");
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "transactions_balanced" AFTER INSERT OR UPDATE OF "status" ON "ledger"."transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger"."validate_transaction_change"();
--> statement-breakpoint
-- History and transactions are never deleted (transactions are voided instead), except when
-- their owner deletes the account: the cascade runs after the user row is gone.
CREATE FUNCTION "ledger"."only_with_owner"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "identity"."users" WHERE "id" = OLD."user_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ledger: % rows are never % (void transactions instead)', TG_TABLE_NAME, lower(TG_OP) || 'd'
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "transaction_audit_append_only" BEFORE UPDATE OR DELETE ON "ledger"."transaction_audit"
  FOR EACH ROW EXECUTE FUNCTION "ledger"."only_with_owner"();
--> statement-breakpoint
CREATE TRIGGER "transactions_never_deleted" BEFORE DELETE ON "ledger"."transactions"
  FOR EACH ROW EXECUTE FUNCTION "ledger"."only_with_owner"();
