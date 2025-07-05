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
    allocated_amount DECIMAL(12, 2) NOT NULL,
    notes TEXT
);

-- Create buffer_history table
CREATE TABLE IF NOT EXISTS buffer_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    balance DECIMAL(12, 2) NOT NULL,
    recommended_buffer DECIMAL(12, 2) NOT NULL,
    excess_amount DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
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
    executed_at TIMESTAMP DEFAULT NOW(),
    executed_amount DECIMAL(12, 2) NOT NULL,
    notes TEXT
);

-- Create account_balances table
CREATE TABLE IF NOT EXISTS account_balances (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    balance DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    fire_target_multiplier DECIMAL(3, 1) DEFAULT 25.0,
    monthly_expenses DECIMAL(12, 2),
    withdrawal_rate DECIMAL(3, 3) DEFAULT 0.04,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create crypto_wallets table
CREATE TABLE IF NOT EXISTS crypto_wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    wallet_name TEXT NOT NULL,
    wallet_address TEXT,
    exchange_name TEXT,
    wallet_type TEXT, -- hardware, software, exchange
    notes TEXT
);

-- Create crypto_transactions table
CREATE TABLE IF NOT EXISTS crypto_transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL,
    date TIMESTAMP NOT NULL,
    type TEXT NOT NULL, -- buy, sell, transfer
    amount DECIMAL(18, 8) NOT NULL,
    asset TEXT NOT NULL, -- BTC, ETH, etc.
    price_per_unit DECIMAL(12, 2),
    fee DECIMAL(12, 2),
    notes TEXT
);

-- Create import_batches table
CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    batch_name TEXT NOT NULL,
    batch_date TIMESTAMP DEFAULT NOW(),
    total_files INTEGER DEFAULT 0,
    successful_imports INTEGER DEFAULT 0,
    failed_imports INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress'
);

-- Create import_history table
CREATE TABLE IF NOT EXISTS import_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    batch_id INTEGER,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    statement_id TEXT,
    accounts_found INTEGER DEFAULT 0,
    transactions_imported INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    import_date TIMESTAMP DEFAULT NOW()
);

-- Create transaction_hashes table for duplicate detection
CREATE TABLE IF NOT EXISTS transaction_hashes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    transaction_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create transfer_preferences table
CREATE TABLE IF NOT EXISTS transfer_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    preference_type TEXT NOT NULL, -- buffer, goal, investment, emergency
    priority INTEGER NOT NULL,
    account_id INTEGER,
    account_role TEXT,
    goal_pattern TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_transaction_hashes_hash ON transaction_hashes(transaction_hash);

-- Insert default categories
INSERT INTO categories (name, type, color, icon, is_system_category) VALUES
-- Income Categories
('Salary', 'income', '#22c55e', '💰', TRUE),
('Freelance', 'income', '#10b981', '💼', TRUE),
('Investment Income', 'income', '#06b6d4', '📈', TRUE),
-- Expense Categories
('Housing', 'expense', '#ef4444', '🏠', TRUE),
('Food & Dining', 'expense', '#f97316', '🍽️', TRUE),
('Transportation', 'expense', '#eab308', '🚗', TRUE),
('Utilities', 'expense', '#8b5cf6', '⚡', TRUE),
('Healthcare', 'expense', '#ec4899', '🏥', TRUE),
('Entertainment', 'expense', '#06b6d4', '🎭', TRUE),
('Shopping', 'expense', '#f59e0b', '🛍️', TRUE),
('Insurance', 'expense', '#6366f1', '🛡️', TRUE),
('Investments', 'expense', '#059669', '💎', TRUE),
('Emergency Fund', 'expense', '#dc2626', '🚨', TRUE)
ON CONFLICT DO NOTHING;

-- Create demo user (optional - remove in production)
INSERT INTO users (username, password) VALUES ('demo', 'demo123') ON CONFLICT DO NOTHING;

COMMIT;