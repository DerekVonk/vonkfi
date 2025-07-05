# VonkFi - Personal Finance Management Platform

VonkFi is a comprehensive personal finance management application designed to help users track expenses, manage budgets, set financial goals, and plan for financial independence. Built with modern web technologies, VonkFi offers a seamless experience for importing bank statements, categorizing transactions, and visualizing financial data.

## 🌟 Features

- **Bank Statement Import**: Easily import transactions from bank statements in CAMT.053 XML format
- **Transaction Categorization**: Automatic and manual categorization of transactions
- **Zero-Based Budgeting**: Allocate every dollar to specific categories
- **Financial Goal Tracking**: Set and monitor progress towards savings goals
- **Expense Analysis**: Visualize spending patterns with interactive charts
- **FIRE Calculations**: Financial Independence/Retire Early planning tools
- **Multi-Account Management**: Track multiple bank accounts in one place
- **Transfer Recommendations**: AI-generated suggestions for optimizing your finances
- **Duplicate Detection**: Automatically identify duplicate transactions
- **Secure Authentication**: Protect your financial data with robust security measures

## 📊 Understanding Your Financial Data: Monthly Overview Guide

The Monthly Overview is the central dashboard feature that transforms your imported bank transactions into meaningful financial insights. Understanding how these calculations work will help you make the most of VonkFi's financial planning capabilities.

### How Transactions Are Processed

#### Income vs. Expense Classification
VonkFi automatically categorizes transactions based on the CAMT.053 banking standard:
- **Income (Green)**: Transactions with positive amounts (money coming into your account)
  - Salary deposits, freelance payments, investment returns, refunds
- **Expenses (Red)**: Transactions with negative amounts (money leaving your account)
  - Purchases, bills, transfers to other accounts, fees

This classification happens automatically during import and is based on the credit/debit indicators in your bank statement.

#### Monthly Calculation Method
The Monthly Overview uses a **6-month rolling average** approach:

1. **Data Window**: Only the last 6 months of transactions are used for calculations
2. **Monthly Aggregation**: Transactions are grouped by month (YYYY-MM format)
3. **Income Calculation**: Sum of all positive transactions per month
4. **Expense Calculation**: Sum of all negative transactions per month (shown as positive amounts)
5. **Savings Calculation**: Income minus Expenses for each month

#### Current Month Display
The "Current Month" metrics shown in the Monthly Overview represent:
- **Monthly Income**: 6-month average of your income
- **Monthly Expenses**: 6-month average of your expenses  
- **Savings**: Difference between average income and expenses
- **Savings Rate**: Percentage of income saved (calculated as savings ÷ income)

### FIRE (Financial Independence) Calculations

VonkFi includes sophisticated FIRE planning tools:

#### Key Metrics
- **FIRE Progress**: Current savings ÷ (25 × annual expenses)
- **Time to FIRE**: Years needed to reach financial independence
- **Target Amount**: 25 times your annual expenses (based on 4% withdrawal rule)
- **Emergency Buffer**: Recommended €3,000-€4,000 emergency fund

#### Volatility Analysis
- **Income Volatility**: Measures consistency of your income using coefficient of variation
- **Risk Assessment**: Categorizes income as low/medium/high volatility
- **Buffer Recommendations**: Higher volatility = larger recommended emergency fund

### Using Historical Data

#### Monthly Navigation
- Use the arrow buttons to navigate between months
- **Current Month**: Shows 6-month averages (marked with "Current Month")
- **Historical Months**: Shows actual data for that specific month
- **Future Months**: Navigation disabled (no data available)

#### Understanding the Metrics
- **Income (Green Arrow Up)**: Total money received in that month
- **Essential (Gray Arrow Down)**: Total money spent in that month
- **Savings (Purple Piggy Bank)**: Net savings (income - expenses)
- **Transfers (Orange Arrows)**: Number of AI-recommended transfers

### Best Practices for Accurate Calculations

#### Import Consistency
1. **Regular Imports**: Import bank statements monthly for accurate tracking
2. **Complete Data**: Import all accounts for comprehensive financial picture
3. **Recent Data**: Ensure you have at least 6 months of transaction history

#### Transaction Quality
1. **Category Assignment**: While not required for monthly calculations, categories help with detailed analysis
2. **Duplicate Management**: VonkFi automatically detects duplicates, but review import history
3. **Account Verification**: Verify account balances match your bank statements

#### Understanding Averages
- The system prioritizes **consistency** over absolute accuracy for single months
- 6-month averages smooth out irregular income/expense patterns
- Seasonal variations (bonuses, annual bills) are automatically averaged out

### Troubleshooting Common Issues

#### "No Data" or Zero Values
- **Cause**: Insufficient transaction history (less than 6 months)
- **Solution**: Import more historical bank statements

#### Unexpected Income/Expense Classification
- **Cause**: Internal transfers between your accounts appear as income/expense
- **Solution**: This is normal behavior; focus on net position across all accounts

#### Volatility Warnings
- **High Volatility**: Consider larger emergency fund, more conservative planning
- **Low Volatility**: Stable income allows for more aggressive savings goals

### Privacy and Security
- All calculations happen locally on your device or secure server
- No transaction data is shared with third parties
- Historical data is preserved for accurate trend analysis

This calculation methodology ensures that your Monthly Overview provides stable, actionable insights for financial planning while adapting to your actual spending and earning patterns.

## 📋 Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL (for local development)
- Redis (for caching and session management)
- Docker and Docker Compose (for containerized setup)

## 🚀 Getting Started

### Option 1: Standard Setup

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd VonkFi
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Initialize the database
   ```bash
   npm run db:push
   ```

5. Start the development server
   ```bash
   npm run dev
   ```

### Option 2: Docker Setup

1. Clone the repository
   ```bash
   git clone <repository-url>
   cd VonkFi
   ```

2. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start the application with Docker Compose
   ```bash
   # Production mode
   docker-compose up -d
   
   # Development mode
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

4. Access the application
   - Application: http://localhost:3000
   - Database Admin (dev only): http://localhost:8080
   - Redis Admin (dev only): http://localhost:8081

## 🐳 Docker Management

VonkFi uses Docker Compose with separate configurations for different environments:

- `docker-compose.yml` - Production configuration
- `docker-compose.dev.yml` - Development overrides (includes pgAdmin and Redis admin)
- `docker-compose.test.yml` - Testing environment

### Quick Commands

```bash
# Development (with admin tools)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production
docker-compose up -d

# Testing
docker-compose -f docker-compose.test.yml up -d

# Stop services
docker-compose down
```

Admin interfaces (dev only):
- pgAdmin: http://localhost:8080
- Redis Admin: http://localhost:8081

## 🧪 Testing

### Testing Framework

- VonkFi uses Vitest as the testing framework
- Tests are located in the `/test` directory
- The test setup is configured in `vitest.config.ts`

### Available Test Scripts

- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:coverage` - Run tests with coverage report
- Tests can be run with or without a database connection
- Database tests are skipped if no connection is available (using the `itIfDb` helper)

### Option 1: Run tests with a test database (recommended)

The test suite is designed to work with a test database. This ensures that all tests, including database-dependent tests, can run successfully.

1. Make sure you have Docker and Docker Compose installed.

2. Run the tests using the provided script:

```bash
# Make the script executable
chmod +x ./run-tests.sh

# Run the tests
./run-tests.sh
```

This script will:
- Start a PostgreSQL test database using Docker Compose
- Run the test suite
- Clean up the database when done

### Option 2: Run tests without a database

If you don't have Docker installed or prefer to run tests without a database, you can still run the tests:

```bash
npm test
```

Note that database-dependent tests will be skipped in this case.

### Writing Tests

- Use the `describe` and `it` functions to structure tests
- For database tests, use `itIfDb` instead of `it` to skip when no database is available
- Mock external dependencies when necessary
- Use the `beforeEach` and `afterEach` hooks for setup and cleanup

### Test Example

```typescript
// Example of a simple test without database dependency
import { describe, it, expect } from 'vitest';

describe('Math operations', () => {
  it('should correctly add two numbers', () => {
    expect(1 + 1).toBe(2);
  });
});

// Example of a database-dependent test
import { describe, itIfDb, expect } from 'vitest';
import { storage } from '../server/storage';

describe('User operations', () => {
  itIfDb('should create a new user', async () => {
    const user = await storage.createUser({
      email: 'test@example.com',
      password: 'securePassword123',
      name: 'Test User'
    });
    
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

## 📁 Project Structure

```
VonkFi/
├── client/             # Frontend React application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Application pages
│   │   ├── hooks/      # Custom React hooks
│   │   └── lib/        # Utilities and API client
├── server/             # Backend Express application
│   ├── middleware/     # Express middleware
│   ├── routes/         # API routes
│   ├── services/       # Business logic services
│   ├── validation/     # Request validation schemas
│   └── utils/          # Server utilities
├── shared/             # Shared types and schemas
├── test/               # Test files
├── dist/               # Compiled output
├── docker-compose*.yml # Docker configurations
└── ...                 # Configuration files
```

## 🔒 Security

VonkFi implements several security measures:

- CSRF protection
- Rate limiting
- Secure session management
- Input validation and sanitization
- Password hashing with bcrypt
- Security headers

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request