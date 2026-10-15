CREATE TABLE "ledger"."idempotency_keys" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"command_sha256" text NOT NULL,
	"response_status" integer,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key"),
	CONSTRAINT "idempotency_keys_key" CHECK (length("ledger"."idempotency_keys"."key") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "ledger"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;