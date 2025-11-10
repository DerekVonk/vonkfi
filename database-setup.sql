-- VonkFi Database Setup Script
-- PostgreSQL Database Initialization
-- Run this script on a fresh PostgreSQL database to set up VonkFi

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    iban TEXT NOT NULL,
    bic TEXT,
    account_holder_name TEXT NOT NULL,
    bank_name TEXT,
    custom_name TEXT,
    account_type TEXT, -- checking, savings, investment
    role TEXT, -- income, spending, emergency, goal-specific
    balance DECIMAL(12, 2) DEFAULT 0,
    discovered_date TIMESTAMP DEFAULT NOW(),
    last_seen_date TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'EUR',
    description TEXT,
    merchant TEXT,
    category_id INTEGER,
    is_income BOOLEAN DEFAULT FALSE,
    counterparty_iban TEXT,
    counterparty_name TEXT,
    reference TEXT,
    statement_id TEXT,
    transaction_type TEXT -- credit, debit, transfer
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- essential, discretionary, income, transfer
    parent_id INTEGER,
    color TEXT,
    icon TEXT,
    is_system_category BOOLEAN DEFAULT FALSE
);

-- Create goals table
CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL,
    current_amount DECIMAL(12, 2) DEFAULT 0,
    linked_account_id INTEGER,
    target_date TEXT,
    priority INTEGER DEFAULT 1,
    is_completed BOOLEAN DEFAULT FALSE
);

-- Create allocations table
CREATE TABLE IF NOT EXISTS allocations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category_id INTEGER,
    goal_id INTEGER,
    percentage DECIMAL(5, 2) NOT NULL,
    fixed_amount DECIMAL(12, 2),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create budget_periods table
CREATE TABLE IF NOT EXISTS budget_periods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL, -- "January 2025", "Q1 2025"
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    total_income DECIMAL(12, 2) DEFAULT 0,
    total_allocated DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create budget_categories table
CREATE TABLE IF NOT EXISTS budget_categories (
    id SERIAL PRIMARY KEY,
    budget_period_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    allocated_amount DECIMAL(12, 2) NOT NULL,
    spent_amount DECIMAL(12, 2) DEFAULT 0,
    priority INTEGER DEFAULT 1, -- 1=needs, 2=wants, 3=savings
    notes TEXT,
    is_fixed BOOLEAN DEFAULT FALSE -- for fixed expenses
);

-- Create budget_accounts table
CREATE TABLE IF NOT EXISTS budget_accounts (
    id SERIAL PRIMARY KEY,
    budget_period_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    target_balance DECIMAL(12, 2),
    allocated_amount DECIMAL(12, 2) DEFAULT 0
);

-- Create buffer_history table
CREATE TABLE IF NOT EXISTS buffer_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL,
    status TEXT NOT NULL
);

-- Create transfer_recommendations table
CREATE TABLE IF NOT EXISTS transfer_recommendations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    goal_id INTEGER,
    date TIMESTAMP DEFAULT NOW()
);

-- Create transfer_executions table
CREATE TABLE IF NOT EXISTS transfer_executions (
    id SERIAL PRIMARY KEY,
    recommendation_id INTEGER NOT NULL,
    executed_date TIMESTAMP DEFAULT NOW(),
    confirmed_by_user BOOLEAN DEFAULT TRUE
);

-- Create account_balances table
CREATE TABLE IF NOT EXISTS account_balances (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    balance DECIMAL(12, 2) NOT NULL,
    source_statement_id TEXT
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    settings JSONB NOT NULL
);

-- Create crypto_wallets table
CREATE TABLE IF NOT EXISTS crypto_wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    currency TEXT NOT NULL,
    provider TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create crypto_transactions table
CREATE TABLE IF NOT EXISTS crypto_transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    price DECIMAL(12, 2),
    fiat_amount DECIMAL(12, 2),
    tx_hash TEXT
);

-- Create import_batches table
CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    batch_date TIMESTAMP DEFAULT NOW(),
    total_files INTEGER DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    accounts_affected TEXT[],
    status TEXT DEFAULT 'completed',
    notes TEXT
);

-- Create import_history table
CREATE TABLE IF NOT EXISTS import_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    batch_id INTEGER,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    statement_id TEXT,
    import_date TIMESTAMP DEFAULT NOW(),
    accounts_found INTEGER DEFAULT 0,
    transactions_imported INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    error_message TEXT
);

-- Create transaction_hashes table for duplicate detection
CREATE TABLE IF NOT EXISTS transaction_hashes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_hash UNIQUE(user_id, hash)
);

-- Create transfer_preferences table
CREATE TABLE IF NOT EXISTS transfer_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    preference_type TEXT NOT NULL,
    priority INTEGER NOT NULL,
    account_id INTEGER,
    account_role TEXT,
    goal_pattern TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_type_priority UNIQUE(user_id, preference_type, priority)
);

-- Add foreign key constraints
ALTER TABLE import_history ADD CONSTRAINT import_history_batch_id_import_batches_id_fk FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE transaction_hashes ADD CONSTRAINT transaction_hashes_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE transfer_preferences ADD CONSTRAINT transfer_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE transfer_preferences ADD CONSTRAINT transfer_preferences_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user_id ON allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_periods_user_id ON budget_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_recommendations_user_id ON transfer_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_import_history_user_id ON import_history(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_hashes_user_id ON transaction_hashes(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_hashes_hash ON transaction_hashes(hash);

-- Insert default categories
INSERT INTO categories (name, type, color, icon, is_system_category) VALUES
-- Income Categories
('Salary', 'income', '#22c55e', '=°', TRUE),
('Freelance', 'income', '#10b981', '=¼', TRUE),
('Investment Income', 'income', '#06b6d4', '=È', TRUE),
-- Expense Categories
('Housing', 'essential', '#ef4444', '<à', TRUE),
('Food & Dining', 'essential', '#f97316', '<}', TRUE),
('Transportation', 'essential', '#eab308', '=—', TRUE),
('Utilities', 'essential', '#8b5cf6', '¡', TRUE),
('Healthcare', 'essential', '#ec4899', '<å', TRUE),
('Entertainment', 'discretionary', '#06b6d4', '<­', TRUE),
('Shopping', 'discretionary', '#f59e0b', '=Í', TRUE),
('Insurance', 'essential', '#6366f1', '=á', TRUE),
('Investments', 'transfer', '#059669', '=Ž', TRUE),
('Emergency Fund', 'transfer', '#dc2626', '=¨', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Create demo user for testing
INSERT INTO users (username, password) VALUES ('test_user', 'test_password_hash') ON CONFLICT (username) DO NOTHING;

-- Insert a test account linked to the test user  
INSERT INTO accounts (user_id, iban, account_holder_name, account_type, role) VALUES 
(1, 'NL91ABNA0417164300', 'Test User', 'checking', 'spending')
ON CONFLICT DO NOTHING;

COMMIT;