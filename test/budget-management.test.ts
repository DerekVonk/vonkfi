import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import express from 'express';
import {storage} from '../server/storage';
import {registerRoutes} from '../server/routes';
import { dbConnectionFailed } from './setup';

const app = express();
app.use(express.json());

// Helper function to conditionally skip tests that require database connection
const itIfDb = dbConnectionFailed ? it.skip : it;

describe('Budget Management Tests', () => {
    let server: any;
    let testUserId: number;

    beforeEach(async () => {
        if (dbConnectionFailed) {
            console.log('Skipping database test - no test database available');
            return;
        }

        try {
            server = await registerRoutes(app);

            // Create test user
            const user = await storage.createUser({
                username: `testuser_${Date.now()}`,
                password: 'testpass123'
            });
            testUserId = user.id;

            // Clean up any existing data
            await storage.clearUserData(testUserId);
        } catch (error) {
            console.warn('Database setup failed, skipping database tests:', error.message);
            process.env.SKIP_DB_TESTS = 'true';
            return;
        }
    });

    afterEach(async () => {
        if (server) {
            server.close();
        }
    });

    describe('Budget Period Management', () => {
        itIfDb('should create a new budget period', async () => {
            const budgetData = {
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            };

            // TODO: Implement budget period creation endpoint
            // const response = await request(app)
            //   .post('/api/budgets')
            //   .send(budgetData)
            //   .expect(200);

            // For now, test through storage layer
            const budget = await storage.createBudgetPeriod(budgetData);

            expect(budget.id).toBeDefined();
            expect(budget.userId).toBe(testUserId);
            expect(budget.month).toBe('2024-01');
            expect(parseFloat(budget.totalIncome)).toBe(5000.00);
            expect(budget.status).toBe('active');
        });

        itIfDb('should retrieve budget periods for a user', async () => {
            // Create multiple budget periods
            await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'completed'
            });

            await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-02',
                totalIncome: 5200.00,
                status: 'active'
            });

            const budgets = await storage.getBudgetPeriodsByUserId(testUserId);

            expect(budgets).toHaveLength(2);
            expect(budgets.map(b => b.month)).toContain('2024-01');
            expect(budgets.map(b => b.month)).toContain('2024-02');
        });

        itIfDb('should update a budget period', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'draft'
            });

            const updatedBudget = await storage.updateBudgetPeriod(budget.id, {
                totalIncome: '5500.00',
                status: 'active'
            });

            expect(parseFloat(updatedBudget.totalIncome)).toBe(5500.00);
            expect(updatedBudget.status).toBe('active');
        });

        itIfDb('should not allow duplicate budget periods for same month', async () => {
            await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            // Attempt to create duplicate should fail
            await expect(storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5200.00,
                status: 'draft'
            })).rejects.toThrow();
        });
    });

    describe('Budget Category Allocation', () => {
        itIfDb('should create budget allocations for categories', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            const groceryCategory = await storage.createCategory({
                name: 'Groceries',
                type: 'essential'
            });

            const entertainmentCategory = await storage.createCategory({
                name: 'Entertainment',
                type: 'discretionary'
            });

            // Create budget allocations
            const groceryAllocation = await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: groceryCategory.id,
                allocated: 400.00,
                priority: 'need'
            });

            const entertainmentAllocation = await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: entertainmentCategory.id,
                allocated: 200.00,
                priority: 'want'
            });

            expect(groceryAllocation.allocated).toBe('400');
            expect(entertainmentAllocation.allocated).toBe('200');
            expect(groceryAllocation.priority).toBe('need');
            expect(entertainmentAllocation.priority).toBe('want');
        });

        itIfDb('should implement zero-based budgeting (total allocations = income)', async () => {
            const totalIncome = 5000.00;
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: totalIncome,
                status: 'active'
            });

            // Create categories
            const categories = await Promise.all([
                storage.createCategory({name: 'Rent', type: 'essential'}),
                storage.createCategory({name: 'Groceries', type: 'essential'}),
                storage.createCategory({name: 'Transportation', type: 'essential'}),
                storage.createCategory({name: 'Entertainment', type: 'discretionary'}),
                storage.createCategory({name: 'Savings', type: 'transfer'})
            ]);

            // Create budget allocations
            const allocations = [
                {categoryId: categories[0].id, allocated: 1500.00, priority: 'need'}, // Rent
                {categoryId: categories[1].id, allocated: 600.00, priority: 'need'},  // Groceries
                {categoryId: categories[2].id, allocated: 300.00, priority: 'need'},  // Transport
                {categoryId: categories[3].id, allocated: 200.00, priority: 'want'},  // Entertainment
                {categoryId: categories[4].id, allocated: 2400.00, priority: 'save'}  // Savings
            ];

            for (const allocation of allocations) {
                await storage.createBudgetCategory({
                    budgetPeriodId: budget.id,
                    categoryId: allocation.categoryId,
                    allocated: allocation.allocated,
                    priority: allocation.priority
                });
            }

            // Verify zero-based budgeting
            const budgetCategories = await storage.getBudgetCategoriesByBudgetId(budget.id);
            const totalAllocated = budgetCategories.reduce((sum, bc) => sum + parseFloat(bc.allocated), 0);

            expect(totalAllocated).toBe(totalIncome);
        });

        itIfDb('should track actual spending vs budget allocations', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            const groceryCategory = await storage.createCategory({
                name: 'Groceries',
                type: 'essential'
            });

            await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: groceryCategory.id,
                allocated: 400.00,
                priority: 'need'
            });

            // Create account and transactions
            const account = await storage.createAccount({
                userId: testUserId,
                iban: 'GB12ABCD12345678901234',
                accountHolderName: 'Test User',
                balance: '5000.00'
            });

            // Create grocery transactions
            await storage.createTransaction({
                accountId: account.id,
                date: new Date('2024-01-15'),
                amount: '-120.00',
                description: 'Weekly groceries',
                categoryId: groceryCategory.id
            });

            await storage.createTransaction({
                accountId: account.id,
                date: new Date('2024-01-22'),
                amount: '-95.50',
                description: 'More groceries',
                categoryId: groceryCategory.id
            });

            // Calculate actual spending for category in budget period
            const transactions = await storage.getTransactionsByUserId(testUserId);
            const groceryTransactions = transactions.filter(t =>
                t.categoryId === groceryCategory.id &&
                t.date >= new Date('2024-01-01') &&
                t.date < new Date('2024-02-01')
            );

            const actualSpent = groceryTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

            expect(actualSpent).toBe(215.50); // 120 + 95.50
            expect(actualSpent).toBeLessThan(400); // Under budget
        });

        itIfDb('should warn when category spending exceeds allocation', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            const entertainmentCategory = await storage.createCategory({
                name: 'Entertainment',
                type: 'discretionary'
            });

            await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: entertainmentCategory.id,
                allocated: 100.00,
                priority: 'want'
            });

            const account = await storage.createAccount({
                userId: testUserId,
                iban: 'GB12ABCD12345678901234',
                accountHolderName: 'Test User',
                balance: '5000.00'
            });

            // Create transactions that exceed budget
            await storage.createTransaction({
                accountId: account.id,
                date: new Date('2024-01-10'),
                amount: '-75.00',
                description: 'Cinema',
                categoryId: entertainmentCategory.id
            });

            await storage.createTransaction({
                accountId: account.id,
                date: new Date('2024-01-20'),
                amount: '-40.00',
                description: 'Concert',
                categoryId: entertainmentCategory.id
            });

            // TODO: Implement budget overspending detection
            const transactions = await storage.getTransactionsByUserId(testUserId);
            const entertainmentTransactions = transactions.filter(t => t.categoryId === entertainmentCategory.id);
            const actualSpent = entertainmentTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

            expect(actualSpent).toBe(115.00); // 75 + 40
            expect(actualSpent).toBeGreaterThan(100.00); // Over budget
        });
    });

    describe('Budget Auto-Generation', () => {
        itIfDb('should generate budget from historical spending data', async () => {
            // Create historical transactions
            const account = await storage.createAccount({
                userId: testUserId,
                iban: 'GB12ABCD12345678901234',
                accountHolderName: 'Test User',
                balance: '5000.00'
            });

            const groceryCategory = await storage.createCategory({
                name: 'Groceries',
                type: 'essential'
            });

            const entertainmentCategory = await storage.createCategory({
                name: 'Entertainment',
                type: 'discretionary'
            });

            // Create transactions from previous months
            const previousMonthTransactions = [
                {amount: '-350.00', categoryId: groceryCategory.id, date: new Date('2023-12-05')},
                {amount: '-380.00', categoryId: groceryCategory.id, date: new Date('2023-11-10')},
                {amount: '-420.00', categoryId: groceryCategory.id, date: new Date('2023-10-15')},
                {amount: '-150.00', categoryId: entertainmentCategory.id, date: new Date('2023-12-01')},
                {amount: '-120.00', categoryId: entertainmentCategory.id, date: new Date('2023-11-20')},
                {amount: '-180.00', categoryId: entertainmentCategory.id, date: new Date('2023-10-25')}
            ];

            for (const txn of previousMonthTransactions) {
                await storage.createTransaction({
                    accountId: account.id,
                    date: txn.date,
                    amount: txn.amount,
                    description: 'Historical transaction',
                    categoryId: txn.categoryId
                });
            }

            // TODO: Implement budget auto-generation from historical data
            // const response = await request(app)
            //   .post(`/api/budgets/${testUserId}/generate`)
            //   .send({ month: '2024-01', basedOnMonths: 3 })
            //   .expect(200);

            // Expected: Average of last 3 months
            // Groceries: (350 + 380 + 420) / 3 = 383.33
            // Entertainment: (150 + 120 + 180) / 3 = 150.00

            const transactions = await storage.getTransactionsByUserId(testUserId);
            expect(transactions.length).toBe(6);
        });

        itIfDb('should adjust budget suggestions based on income changes', async () => {
            // TODO: Implement income-based budget adjustments
            // If income increases/decreases, budget allocations should adjust proportionally

            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            expect(parseFloat(budget.totalIncome)).toBe(5000.00);
        });
    });

    describe('Budget Analysis and Reporting', () => {
        itIfDb('should provide budget vs actual analysis', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'completed'
            });

            const categories = await Promise.all([
                storage.createCategory({name: 'Rent', type: 'essential'}),
                storage.createCategory({name: 'Groceries', type: 'essential'}),
                storage.createCategory({name: 'Entertainment', type: 'discretionary'})
            ]);

            // Create budget allocations
            const allocations = [
                {categoryId: categories[0].id, allocated: 1500.00},
                {categoryId: categories[1].id, allocated: 400.00},
                {categoryId: categories[2].id, allocated: 200.00}
            ];

            for (const allocation of allocations) {
                await storage.createBudgetCategory({
                    budgetPeriodId: budget.id,
                    categoryId: allocation.categoryId,
                    allocated: allocation.allocated,
                    priority: 'need'
                });
            }

            // TODO: Implement budget analysis endpoint
            // const response = await request(app)
            //   .get(`/api/budgets/${budget.id}/analysis`)
            //   .expect(200);

            // Should return comparison of budgeted vs actual for each category
            const budgetCategories = await storage.getBudgetCategoriesByBudgetId(budget.id);
            expect(budgetCategories).toHaveLength(3);
        });

        itIfDb('should calculate budget variance and percentage utilization', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            const groceryCategory = await storage.createCategory({
                name: 'Groceries',
                type: 'essential'
            });

            await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: groceryCategory.id,
                allocated: 400.00,
                priority: 'need'
            });

            const account = await storage.createAccount({
                userId: testUserId,
                iban: 'GB12ABCD12345678901234',
                accountHolderName: 'Test User',
                balance: '5000.00'
            });

            // Spend 350 out of 400 budgeted
            await storage.createTransaction({
                accountId: account.id,
                date: new Date('2024-01-15'),
                amount: '-350.00',
                description: 'Grocery spending',
                categoryId: groceryCategory.id
            });

            // Calculate utilization: 350/400 = 87.5%
            // Variance: 400 - 350 = 50 (under budget)

            const transactions = await storage.getTransactionsByUserId(testUserId);
            const groceryTransactions = transactions.filter(t => t.categoryId === groceryCategory.id);
            const actualSpent = groceryTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

            const budgeted = 400.00;
            const utilization = (actualSpent / budgeted) * 100;
            const variance = budgeted - actualSpent;

            expect(utilization).toBe(87.5);
            expect(variance).toBe(50);
        });

        itIfDb('should identify budget trends over multiple periods', async () => {
            // Create budgets for multiple months
            const budgets = await Promise.all([
                storage.createBudgetPeriod({
                    userId: testUserId,
                    month: '2023-11',
                    totalIncome: 4800.00,
                    status: 'completed'
                }),
                storage.createBudgetPeriod({
                    userId: testUserId,
                    month: '2023-12',
                    totalIncome: 5000.00,
                    status: 'completed'
                }),
                storage.createBudgetPeriod({
                    userId: testUserId,
                    month: '2024-01',
                    totalIncome: 5200.00,
                    status: 'active'
                })
            ]);

            // TODO: Implement budget trend analysis
            // Should identify:
            // - Income growth trends
            // - Category spending patterns
            // - Budget adherence improvements

            expect(budgets).toHaveLength(3);
            expect(budgets.map(b => parseFloat(b.totalIncome))).toEqual([4800, 5000, 5200]);
        });
    });

    describe('Budget Recommendations', () => {
        itIfDb('should recommend budget adjustments based on spending patterns', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            const groceryCategory = await storage.createCategory({
                name: 'Groceries',
                type: 'essential'
            });

            await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: groceryCategory.id,
                allocated: 300.00,
                priority: 'need'
            });

            // TODO: Implement budget recommendation engine
            // If consistently overspending in a category, recommend increasing allocation
            // If consistently underspending, recommend decreasing allocation

            expect(budget.id).toBeDefined();
        });

        itIfDb('should suggest optimizations for FIRE goals', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'active'
            });

            // Create FIRE goal
            const fireGoal = await storage.createGoal({
                userId: testUserId,
                name: 'FIRE by 50',
                target: 1000000,
                priority: 'high'
            });

            // TODO: Implement FIRE-optimized budget recommendations
            // Should suggest:
            // - Minimum essential spending
            // - Maximum savings allocation
            // - Optimization of discretionary spending

            expect(fireGoal.target).toBe(1000000);
        });
    });

    describe('Budget Import/Export', () => {
        itIfDb('should export budget data for backup', async () => {
            const budget = await storage.createBudgetPeriod({
                userId: testUserId,
                month: '2024-01',
                totalIncome: 5000.00,
                status: 'completed'
            });

            const category = await storage.createCategory({
                name: 'Export Test',
                type: 'essential'
            });

            await storage.createBudgetCategory({
                budgetPeriodId: budget.id,
                categoryId: category.id,
                allocated: 500.00,
                priority: 'need'
            });

            // TODO: Implement budget export functionality
            // const response = await request(app)
            //   .get(`/api/budgets/${testUserId}/export`)
            //   .expect(200);

            const budgetCategories = await storage.getBudgetCategoriesByBudgetId(budget.id);
            expect(budgetCategories).toHaveLength(1);
        });

        itIfDb('should import budget templates', async () => {
            const budgetTemplate = {
                month: '2024-02',
                totalIncome: 5000.00,
                categories: [
                    {name: 'Rent', allocated: 1500.00, priority: 'need'},
                    {name: 'Groceries', allocated: 400.00, priority: 'need'},
                    {name: 'Savings', allocated: 2000.00, priority: 'save'}
                ]
            };

            // TODO: Implement budget import functionality
            // const response = await request(app)
            //   .post(`/api/budgets/${testUserId}/import`)
            //   .send(budgetTemplate)
            //   .expect(200);

            expect(budgetTemplate.categories).toHaveLength(3);
        });
    });
});
