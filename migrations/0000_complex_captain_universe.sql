CREATE TABLE "account_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"balance" numeric(12, 2) NOT NULL,
	"source_statement_id" text
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"iban" text NOT NULL,
	"bic" text,
	"account_holder_name" text NOT NULL,
	"bank_name" text,
	"custom_name" text,
	"account_type" text,
	"role" text,
	"balance" numeric(12, 2) DEFAULT '0',
	"discovered_date" timestamp DEFAULT now(),
	"last_seen_date" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category_id" integer,
	"goal_id" integer,
	"percentage" numeric(5, 2) NOT NULL,
	"fixed_amount" numeric(12, 2),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "budget_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_period_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"role" text NOT NULL,
	"target_balance" numeric(12, 2),
	"allocated_amount" numeric(12, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_period_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"allocated_amount" numeric(12, 2) NOT NULL,
	"spent_amount" numeric(12, 2) DEFAULT '0',
	"priority" integer DEFAULT 1,
	"notes" text,
	"is_fixed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "budget_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"total_income" numeric(12, 2) DEFAULT '0',
	"total_allocated" numeric(12, 2) DEFAULT '0',
	"is_active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buffer_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" integer,
	"color" text,
	"icon" text,
	"is_system_category" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "crypto_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"price" numeric(12, 2),
	"fiat_amount" numeric(12, 2),
	"tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "crypto_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"currency" text NOT NULL,
	"provider" text,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"current_amount" numeric(12, 2) DEFAULT '0',
	"linked_account_id" integer,
	"target_date" text,
	"priority" integer DEFAULT 1,
	"is_completed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"batch_date" timestamp DEFAULT now(),
	"total_files" integer DEFAULT 0,
	"total_transactions" integer DEFAULT 0,
	"accounts_affected" text[],
	"status" text DEFAULT 'completed',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "import_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"batch_id" integer,
	"file_name" text NOT NULL,
	"file_size" integer,
	"statement_id" text,
	"import_date" timestamp DEFAULT now(),
	"accounts_found" integer DEFAULT 0,
	"transactions_imported" integer DEFAULT 0,
	"duplicates_skipped" integer DEFAULT 0,
	"status" text DEFAULT 'completed',
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "transaction_hashes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"transaction_id" integer NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_user_hash" UNIQUE("user_id","hash")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'EUR',
	"description" text,
	"merchant" text,
	"category_id" integer,
	"is_income" boolean DEFAULT false,
	"counterparty_iban" text,
	"counterparty_name" text,
	"reference" text,
	"statement_id" text
);
--> statement-breakpoint
CREATE TABLE "transfer_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"recommendation_id" integer NOT NULL,
	"executed_date" timestamp DEFAULT now(),
	"confirmed_by_user" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "transfer_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"preference_type" text NOT NULL,
	"priority" integer NOT NULL,
	"account_id" integer,
	"account_role" text,
	"goal_pattern" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_user_type_priority" UNIQUE("user_id","preference_type","priority")
);
--> statement-breakpoint
CREATE TABLE "transfer_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" timestamp DEFAULT now(),
	"from_account_id" integer NOT NULL,
	"to_account_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending',
	"goal_id" integer
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_hashes" ADD CONSTRAINT "transaction_hashes_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_preferences" ADD CONSTRAINT "transfer_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_preferences" ADD CONSTRAINT "transfer_preferences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;