-- VonkFi Database Performance Indexes
-- This file contains optimized indexes for improved query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Accounts table indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_iban ON accounts(iban);
CREATE INDEX IF NOT EXISTS idx_accounts_role ON accounts(role);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_user_active ON accounts(user_id, is_active);

-- Transactions table indexes (most critical for performance)
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_is_income ON transactions(is_income);
CREATE INDEX IF NOT EXISTS idx_transactions_statement_id ON transactions(statement_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_date_amount ON transactions(date DESC, amount);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category_id, date DESC);

-- Partial indexes for better performance on specific queries
CREATE INDEX IF NOT EXISTS idx_transactions_income_date ON transactions(date DESC) WHERE is_income = true;
CREATE INDEX IF NOT EXISTS idx_transactions_expense_date ON transactions(date DESC) WHERE is_income = false;

-- Categories table indexes
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Goals table indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_linked_account_id ON goals(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(priority);
CREATE INDEX IF NOT EXISTS idx_goals_user_priority ON goals(user_id, priority);

-- Transaction hashes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_transaction_hashes_hash ON transaction_hashes(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transaction_hashes_account ON transaction_hashes(account_id);

-- Transfer recommendations indexes
CREATE INDEX IF NOT EXISTS idx_transfer_recommendations_user_id ON transfer_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_recommendations_status ON transfer_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_transfer_recommendations_created ON transfer_recommendations(created_at DESC);

-- Import history indexes
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);
CREATE INDEX IF NOT EXISTS idx_import_history_created ON import_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_batch_id ON import_history(batch_id);

-- Budget periods indexes
CREATE INDEX IF NOT EXISTS idx_budget_periods_user_id ON budget_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_periods_month ON budget_periods(month);
CREATE INDEX IF NOT EXISTS idx_budget_periods_status ON budget_periods(status);
CREATE INDEX IF NOT EXISTS idx_budget_periods_user_month ON budget_periods(user_id, month);

-- Budget categories indexes
CREATE INDEX IF NOT EXISTS idx_budget_categories_period_id ON budget_categories(budget_period_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_category_id ON budget_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_categories_priority ON budget_categories(priority);

-- Crypto wallets indexes
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user_id ON crypto_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_currency ON crypto_wallets(currency);

-- Crypto transactions indexes
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_wallet_id ON crypto_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_date ON crypto_transactions(date DESC);

-- Transfer preferences indexes
CREATE INDEX IF NOT EXISTS idx_transfer_preferences_user_id ON transfer_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_preferences_type ON transfer_preferences(allocation_type);

-- Covering indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_accounts_dashboard_covering ON accounts(user_id, is_active) 
INCLUDE (id, iban, account_holder_name, custom_name, role, balance);

CREATE INDEX IF NOT EXISTS idx_transactions_dashboard_covering ON transactions(account_id, date DESC) 
INCLUDE (id, amount, description, merchant, category_id, is_income);

-- Performance statistics and monitoring
DO $$
BEGIN
    -- Enable query statistics if not already enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    END IF;
END $$;

-- Analyze tables for better query planning
ANALYZE users;
ANALYZE accounts;
ANALYZE transactions;
ANALYZE categories;
ANALYZE goals;
ANALYZE transaction_hashes;
ANALYZE transfer_recommendations;
ANALYZE import_history;
ANALYZE budget_periods;
ANALYZE budget_categories;
ANALYZE crypto_wallets;
ANALYZE crypto_transactions;
ANALYZE transfer_preferences;