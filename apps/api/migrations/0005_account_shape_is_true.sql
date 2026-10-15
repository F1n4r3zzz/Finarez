ALTER TABLE "ledger"."accounts" DROP CONSTRAINT "accounts_kind_shape";--> statement-breakpoint
ALTER TABLE "ledger"."accounts" ADD CONSTRAINT "accounts_kind_shape" CHECK ((("ledger"."accounts"."system_role" is null and "ledger"."accounts"."kind" = 'asset' and "ledger"."accounts"."subtype" in ('bank', 'cash', 'wallet', 'savings', 'investment', 'receivable', 'other_asset'))
       or ("ledger"."accounts"."system_role" is null and "ledger"."accounts"."kind" = 'liability' and "ledger"."accounts"."subtype" in ('credit_card', 'loan', 'payable', 'other_liability'))
       or ("ledger"."accounts"."system_role" = 'income' and "ledger"."accounts"."kind" = 'income' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" = 'expense' and "ledger"."accounts"."kind" = 'expense' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" in ('opening_balance', 'valuation') and "ledger"."accounts"."kind" = 'equity' and "ledger"."accounts"."subtype" is null)
       or ("ledger"."accounts"."system_role" = 'fx' and "ledger"."accounts"."kind" = 'clearing' and "ledger"."accounts"."subtype" is null)) is true);