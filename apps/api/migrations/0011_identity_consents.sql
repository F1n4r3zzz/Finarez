CREATE TABLE "identity"."consents" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_user_id_kind_version_pk" PRIMARY KEY("user_id","kind","version"),
	CONSTRAINT "consents_kind" CHECK (kind in ('terms', 'privacy', 'adult'))
);
--> statement-breakpoint
ALTER TABLE "identity"."consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;