import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { CamtParser } from "./services/camtParser";
import { TransactionCategorizer } from "./services/categorization";
import { FireCalculator } from "./services/fireCalculations";
import { duplicateDetectionService } from "./services/duplicateDetection";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  const camtParser = new CamtParser();
  const fireCalculator = new FireCalculator();

  // Get or create default user for development with error handling
  let defaultUser;
  try {
    defaultUser = await storage.getUserByUsername("demo");
    if (!defaultUser) {
      defaultUser = await storage.createUser({
        username: "demo",
        password: "demo123"
      });
    }
  } catch (error) {
    console.error("Failed to initialize default user:", error);
    // Continue without default user for now
  }

  // Dashboard data endpoint
  app.get("/api/dashboard/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      const [accounts, transactions, goals, categories] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId),
        storage.getCategories()
      ]);

      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      const transferRecommendations = await storage.getTransferRecommendationsByUserId(userId);

      res.json({
        accounts,
        transactions: transactions.slice(0, 10), // Latest 10 transactions
        goals,
        fireMetrics,
        transferRecommendations,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // Import CAMT.053 statement
  app.post("/api/import/:userId", upload.single('camtFile'), async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      

      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const xmlContent = req.file.buffer.toString('utf-8');
      const parsedStatement = await camtParser.parseFile(xmlContent);

      // Get existing transaction hashes for duplicate detection
      const existingHashes = await storage.getTransactionHashesByUserId(userId);
      
      // Filter out duplicate transactions
      const { uniqueTransactions, duplicateCount } = await duplicateDetectionService.filterDuplicates(
        parsedStatement.transactions,
        userId,
        existingHashes
      );

      console.log(`Found ${duplicateCount} duplicate transactions, importing ${uniqueTransactions.length} unique transactions`);

      const results = {
        newAccounts: [] as any[],
        newTransactions: [] as any[],
        categorySuggestions: [] as any[],
        duplicatesSkipped: duplicateCount
      };

      // Process accounts
      for (const accountData of parsedStatement.accounts) {
        const existingAccount = await storage.getAccountByIban(accountData.iban);
        
        if (!existingAccount) {
          const newAccount = await storage.createAccount({
            ...accountData,
            userId,
          });
          results.newAccounts.push(newAccount);
        } else {
          // Update last seen date
          await storage.updateAccount(existingAccount.id, {
            lastSeenDate: new Date(),
          });
        }
      }

      // Get categories for categorization
      const categories = await storage.getCategories();
      const categorizer = new TransactionCategorizer(categories);

      // Process unique transactions only
      for (const transactionData of uniqueTransactions) {
        const account = await storage.getAccountByIban(parsedStatement.accounts[0].iban);
        if (!account) continue;

        const newTransaction = await storage.createTransaction({
          ...transactionData,
          accountId: account.id,
        });
        
        // Suggest category
        const suggestion = categorizer.suggestCategory(newTransaction);
        if (suggestion) {
          results.categorySuggestions.push({
            transactionId: newTransaction.id,
            ...suggestion,
          });
          
          // Auto-apply high-confidence suggestions
          if (suggestion.confidence > 0.8) {
            await storage.updateTransactionCategory(newTransaction.id, suggestion.categoryId);
          }
        }

        results.newTransactions.push(newTransaction);
      }

      // Create transaction hashes for the imported transactions
      if (results.newTransactions.length > 0) {
        const hashRecords = duplicateDetectionService.createHashRecords(results.newTransactions, userId);
        await storage.createTransactionHashBatch(hashRecords);
      }

      // Update goal account balances after processing all transactions
      await storage.updateGoalAccountBalances(userId);

      // Track import history with duplicate tracking
      await storage.createImportHistory({
        userId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        statementId: parsedStatement.statementId,
        accountsFound: results.newAccounts.length,
        transactionsImported: results.newTransactions.length,
        duplicatesSkipped: duplicateCount,
        status: "completed"
      });

      res.json({
        message: "Statement imported successfully",
        ...results,
        statementId: parsedStatement.statementId,
      });
    } catch (error) {
      console.error("Import error:", error);
      
      // Track failed import
      if (req.file) {
        try {
          const userId = parseInt(req.params.userId);
          await storage.createImportHistory({
            userId,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            statementId: "",
            accountsFound: 0,
            transactionsImported: 0,
            duplicatesSkipped: 0,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error"
          });
        } catch (historyError) {
          console.error("Failed to track import history:", historyError);
        }
      }
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to import statement" 
      });
    }
  });

  // Get import history for user
  app.get("/api/imports/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const history = await storage.getImportHistoryByUserId(userId);
      res.json(history);
    } catch (error) {
      console.error("Import history fetch error:", error);
      res.status(500).json({ error: "Failed to fetch import history" });
    }
  });

  // Create import batch
  app.post("/api/import/batches", async (req, res) => {
    try {
      const batch = await storage.createImportBatch(req.body);
      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to create import batch" });
    }
  });

  // Get import batches for user
  app.get("/api/import/batches/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const batches = await storage.getImportBatchesByUserId(userId);
      res.json(batches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch import batches" });
    }
  });

  // Get files within a batch (drill-down)
  app.get("/api/import/batches/:batchId/files", async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      const files = await storage.getImportHistoryByBatchId(batchId);
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch files" });
    }
  });

  // Update import batch
  app.patch("/api/import/batches/:batchId", async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      const batch = await storage.updateImportBatch(batchId, req.body);
      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to update import batch" });
    }
  });

  // Get accounts for user
  app.get("/api/accounts/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const accounts = await storage.getAccountsByUserId(userId);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  // Update account
  app.patch("/api/accounts/:accountId", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const updates = req.body;
      
      const updated = await storage.updateAccount(accountId, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  // Delete account
  app.delete("/api/accounts/:accountId", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const userId = parseInt(req.query.userId as string);
      
      // Check if account has transactions
      const transactions = await storage.getTransactionsByAccountId(accountId);
      if (transactions.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete account with existing transactions. Please clear data first." 
        });
      }
      
      // Check if account is linked to goals
      const goals = await storage.getGoalsByUserId(userId);
      const linkedGoals = goals.filter(g => g.linkedAccountId === accountId);
      if (linkedGoals.length > 0) {
        return res.status(400).json({ 
          error: `Cannot delete account linked to ${linkedGoals.length} goal(s). Please unlink first.` 
        });
      }
      
      await storage.deleteAccount(accountId);
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get transactions for user
  app.get("/api/transactions/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit as string) || 50;
      
      const transactions = await storage.getTransactionsByUserId(userId);
      res.json(transactions.slice(0, limit));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Update transaction category
  app.patch("/api/transactions/:transactionId/category", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const { categoryId } = req.body;
      
      const updated = await storage.updateTransactionCategory(transactionId, categoryId);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update transaction category" });
    }
  });

  // Get categories
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Create category
  app.post("/api/categories", async (req, res) => {
    try {
      const categoryData = req.body;
      const category = await storage.createCategory(categoryData);
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  // Update category
  app.patch("/api/categories/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      const updates = req.body;
      
      const updated = await storage.updateCategory(categoryId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Category update error:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  // Delete category
  app.delete("/api/categories/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      await storage.deleteCategory(categoryId);
      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Category deletion error:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Delete category
  app.delete("/api/categories/:categoryId", async (req, res) => {
    try {
      const categoryId = parseInt(req.params.categoryId);
      
      // Check if category is used in transactions
      const userId = parseInt(req.query.userId as string);
      const transactions = await storage.getTransactionsByUserId(userId);
      const usedInTransactions = transactions.some(t => t.categoryId === categoryId);
      
      if (usedInTransactions) {
        return res.status(400).json({ 
          error: "Cannot delete category used in transactions. Please clear data or reassign transactions first." 
        });
      }
      
      await storage.deleteCategory(categoryId);
      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Category deletion error:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Clear all user data
  app.delete("/api/data/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.clearUserData(userId);
      
      // Recalculate dashboard after clearing data
      const [accounts, transactions, goals] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId)
      ]);

      const fireCalculator = new FireCalculator();
      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      
      res.json({ 
        message: "Import data cleared and dashboard recalculated",
        recalculatedData: {
          accounts: accounts.length,
          transactions: transactions.length,
          goals: goals.length,
          fireMetrics: fireMetrics
        }
      });
    } catch (error) {
      console.error("Clear data error:", error);
      res.status(500).json({ error: "Failed to clear user data" });
    }
  });

  // Recalculate dashboard (refresh data)
  app.post("/api/recalculate/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Update goal account balances first to ensure linked goals have current amounts
      await storage.updateGoalAccountBalances(userId);
      
      // Fetch fresh data and recalculate
      const [accounts, transactions, goals] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId)
      ]);

      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      const allocation = fireCalculator.calculateAllocationRecommendation(
        fireMetrics.monthlyIncome,
        fireMetrics.monthlyExpenses,
        fireMetrics.bufferStatus.current,
        goals
      );

      res.json({
        message: "Dashboard recalculated successfully",
        data: {
          accounts,
          transactions,
          goals,
          fireMetrics,
          allocation
        }
      });
    } catch (error) {
      console.error("Recalculate error:", error);
      res.status(500).json({ error: "Failed to recalculate dashboard" });
    }
  });

  // Get goals for user
  app.get("/api/goals/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const goals = await storage.getGoalsByUserId(userId);
      res.json(goals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch goals" });
    }
  });

  // Create goal
  app.post("/api/goals", async (req, res) => {
    try {
      const goalData = req.body;
      console.log("Creating goal with data:", goalData);
      const goal = await storage.createGoal(goalData);
      res.json(goal);
    } catch (error) {
      console.error("Goal creation error:", error);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  // Update goal
  app.patch("/api/goals/:goalId", async (req, res) => {
    try {
      const goalId = parseInt(req.params.goalId);
      const updates = req.body;
      
      const updated = await storage.updateGoal(goalId, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  // Get transfer recommendations
  app.get("/api/transfers/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const recommendations = await storage.getTransferRecommendationsByUserId(userId);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transfer recommendations" });
    }
  });

  // Generate transfer recommendations
  app.post("/api/transfers/generate/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      const [accounts, transactions, goals] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId)
      ]);

      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      const allocation = fireCalculator.calculateAllocationRecommendation(
        fireMetrics.monthlyIncome,
        fireMetrics.monthlyExpenses,
        fireMetrics.bufferStatus.current,
        goals
      );

      // Generate transfer recommendations based on allocation
      const recommendations = [];
      const mainAccount = accounts.find(a => a.role === 'income') || accounts[0];
      
      if (!mainAccount) {
        return res.status(400).json({ error: "No main account found" });
      }

      // Buffer transfer - Create buffer recommendation even if no specific emergency account exists
      if (allocation.bufferAllocation > 0) {
        console.log(`Buffer allocation: ${allocation.bufferAllocation}, looking for buffer account...`);
        console.log(`Available accounts:`, accounts.map(a => ({ id: a.id, role: a.role, name: a.customName })));
        console.log(`Available goals:`, goals.map(g => ({ id: g.id, name: g.name, linkedAccountId: g.linkedAccountId })));
        
        // Look for emergency account or goal, or suggest creating one
        const bufferAccount = accounts.find(a => a.role === 'emergency') || 
                             accounts.find(a => a.role === 'savings') ||
                             accounts.find(a => a.role === 'goal-specific') ||
                             goals.find(g => g.name.toLowerCase().includes('emergency'))?.linkedAccountId;
        
        console.log(`Found buffer account:`, bufferAccount);
        
        if (bufferAccount) {
          const targetAccountId = typeof bufferAccount === 'number' ? bufferAccount : bufferAccount.id;
          console.log(`Creating transfer recommendation from ${mainAccount.id} to ${targetAccountId}`);
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: targetAccountId,
            amount: allocation.bufferAllocation.toString(),
            purpose: "Emergency buffer maintenance - transfer to savings account",
          });
          recommendations.push(rec);
          console.log(`Buffer transfer recommendation created:`, rec);
        } else {
          // Create a recommendation to establish emergency fund
          console.log(`No buffer account found, creating establishment recommendation`);
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: mainAccount.id, // Self-transfer note
            amount: allocation.bufferAllocation.toString(),
            purpose: `Create emergency fund: Set aside €${allocation.bufferAllocation.toFixed(2)} for emergency buffer`,
          });
          recommendations.push(rec);
          console.log(`Buffer establishment recommendation created:`, rec);
        }
      }

      // Goal transfers
      for (const goalAllocation of allocation.goalAllocations) {
        const goal = goals.find(g => g.id === goalAllocation.goalId);
        if (goal && goal.linkedAccountId) {
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: goal.linkedAccountId,
            amount: goalAllocation.amount.toString(),
            purpose: `Transfer to ${goal.name}`,
            goalId: goal.id,
          });
          recommendations.push(rec);
        }
      }

      res.json({
        recommendations,
        allocation,
        summary: {
          totalRecommended: recommendations.reduce((sum, r) => sum + parseFloat(r.amount), 0),
          numberOfTransfers: recommendations.length,
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate transfer recommendations" });
    }
  });

  // Update transfer recommendation status
  app.patch("/api/transfers/:recommendationId", async (req, res) => {
    try {
      const recommendationId = parseInt(req.params.recommendationId);
      const { status } = req.body;
      
      const updated = await storage.updateTransferRecommendationStatus(recommendationId, status);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update transfer recommendation" });
    }
  });

  // Get crypto wallets
  app.get("/api/crypto/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const wallets = await storage.getCryptoWalletsByUserId(userId);
      res.json(wallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch crypto wallets" });
    }
  });

  // Create crypto wallet
  app.post("/api/crypto", async (req, res) => {
    try {
      const walletData = req.body;
      const wallet = await storage.createCryptoWallet(walletData);
      res.json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to create crypto wallet" });
    }
  });

  // Clear all user data
  app.delete("/api/data/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.clearUserData(userId);
      res.json({ message: "All user data cleared successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear user data" });
    }
  });

  // Zero Based Budgeting routes
  app.get("/api/budget/periods/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const periods = await storage.getBudgetPeriodsByUserId(userId);
      res.json(periods);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budget periods" });
    }
  });

  app.get("/api/budget/periods/active/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const period = await storage.getActiveBudgetPeriod(userId);
      if (period) {
        res.json(period);
      } else {
        res.status(404).json({ error: "No active budget period found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active budget period" });
    }
  });

  app.post("/api/budget/periods", async (req, res) => {
    try {
      const periodData = req.body;
      const userId = periodData.userId;
      
      // Calculate actual income from transactions in the period if not provided
      let totalIncome = periodData.totalIncome;
      
      if (!totalIncome || totalIncome === "0") {
        const startDate = new Date(periodData.startDate);
        const endDate = new Date(periodData.endDate);
        
        // Get all transactions for the user in this period
        const transactions = await storage.getTransactionsByUserId(userId);
        const periodTransactions = transactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate >= startDate && transactionDate <= endDate;
        });
        
        // Calculate income from income account or positive transactions
        const accounts = await storage.getAccountsByUserId(userId);
        const incomeAccount = accounts.find(a => a.role === 'income');
        
        if (incomeAccount) {
          // Sum income transactions from the designated income account
          const incomeTransactions = periodTransactions.filter(t => 
            t.accountId === incomeAccount.id && parseFloat(t.amount) > 0
          );
          totalIncome = incomeTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0).toString();
        } else {
          // Fallback: sum all positive transactions (income) across all accounts
          const incomeTransactions = periodTransactions.filter(t => parseFloat(t.amount) > 0);
          totalIncome = incomeTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0).toString();
        }
      }
      
      const period = await storage.createBudgetPeriod({
        ...periodData,
        totalIncome,
        startDate: new Date(periodData.startDate),
        endDate: new Date(periodData.endDate),
        isActive: true,
      });
      
      res.json(period);
    } catch (error) {
      console.error("Budget period creation error:", error);
      res.status(500).json({ error: "Failed to create budget period" });
    }
  });

  app.get("/api/budget/categories/:budgetPeriodId", async (req, res) => {
    try {
      const budgetPeriodId = parseInt(req.params.budgetPeriodId);
      const categories = await storage.getBudgetCategoriesByPeriod(budgetPeriodId);
      
      // Get the budget period to determine date range
      const periods = await storage.getBudgetPeriodsByUserId(1); // TODO: get from session
      const period = periods.find(p => p.id === budgetPeriodId);
      
      if (period) {
        // Calculate actual spending for each category from transactions
        const transactions = await storage.getTransactionsByUserId(1); // TODO: get from session
        const periodTransactions = transactions.filter(t => {
          const transactionDate = new Date(t.date);
          const startDate = new Date(period.startDate);
          const endDate = new Date(period.endDate);
          return transactionDate >= startDate && transactionDate <= endDate;
        });
        
        // Update spent amounts based on actual transactions
        const categoriesWithSpending = categories.map(category => {
          const categoryTransactions = periodTransactions.filter(t => 
            t.categoryId === category.categoryId && parseFloat(t.amount) < 0
          );
          const actualSpent = Math.abs(categoryTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0));
          
          return {
            ...category,
            spentAmount: actualSpent.toString(),
          };
        });
        
        res.json(categoriesWithSpending);
      } else {
        res.json(categories);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budget categories" });
    }
  });

  app.post("/api/budget/categories", async (req, res) => {
    try {
      const categoryData = req.body;
      const category = await storage.createBudgetCategory(categoryData);
      res.json(category);
    } catch (error) {
      console.error("Budget category creation error:", error);
      res.status(500).json({ error: "Failed to create budget category" });
    }
  });

  app.patch("/api/budget/categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const category = await storage.updateBudgetCategory(id, updates);
      res.json(category);
    } catch (error) {
      console.error("Budget category update error:", error);
      res.status(500).json({ error: "Failed to update budget category" });
    }
  });

  app.delete("/api/budget/categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteBudgetCategory(id);
      res.json({ message: "Budget category deleted successfully" });
    } catch (error) {
      console.error("Budget category deletion error:", error);
      res.status(500).json({ error: "Failed to delete budget category" });
    }
  });

  app.get("/api/budget/accounts/:budgetPeriodId", async (req, res) => {
    try {
      const budgetPeriodId = parseInt(req.params.budgetPeriodId);
      const accounts = await storage.getBudgetAccountsByPeriod(budgetPeriodId);
      res.json(accounts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budget accounts" });
    }
  });

  app.post("/api/budget/accounts", async (req, res) => {
    try {
      const accountData = req.body;
      const account = await storage.createBudgetAccount(accountData);
      res.json(account);
    } catch (error) {
      console.error("Budget account creation error:", error);
      res.status(500).json({ error: "Failed to create budget account" });
    }
  });

  app.get("/api/budget/progress/:budgetPeriodId", async (req, res) => {
    try {
      const budgetPeriodId = parseInt(req.params.budgetPeriodId);
      const progress = await storage.calculateBudgetProgress(budgetPeriodId);
      res.json(progress);
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate budget progress" });
    }
  });

  // Auto-create budget period from monthly statements
  app.post("/api/budget/sync-monthly/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { month, year } = req.body; // e.g., { month: 1, year: 2025 }
      
      // Calculate date range for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of the month
      
      // Get transactions for this month
      const transactions = await storage.getTransactionsByUserId(userId);
      const monthlyTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate >= startDate && transactionDate <= endDate;
      });
      
      // Get accounts to find income account
      const accounts = await storage.getAccountsByUserId(userId);
      const incomeAccount = accounts.find(a => a.role === 'income');
      
      // Calculate total income from income account or all positive transactions
      let totalIncome = 0;
      if (incomeAccount) {
        const incomeTransactions = monthlyTransactions.filter(t => 
          t.accountId === incomeAccount.id && parseFloat(t.amount) > 0
        );
        totalIncome = incomeTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      } else {
        const incomeTransactions = monthlyTransactions.filter(t => parseFloat(t.amount) > 0);
        totalIncome = incomeTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      }
      
      // Create budget period name
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const periodName = `${monthNames[month - 1]} ${year}`;
      
      // Check if period already exists
      const existingPeriods = await storage.getBudgetPeriodsByUserId(userId);
      const existingPeriod = existingPeriods.find(p => p.name === periodName);
      
      if (existingPeriod) {
        return res.json({ 
          message: "Budget period already exists", 
          period: existingPeriod,
          totalIncome: totalIncome.toString(),
          transactionCount: monthlyTransactions.length 
        });
      }
      
      // Create the budget period
      const period = await storage.createBudgetPeriod({
        userId,
        name: periodName,
        startDate,
        endDate,
        totalIncome: totalIncome.toString(),
        isActive: true,
      });
      
      // Auto-create common budget categories based on existing transactions
      const categories = await storage.getCategories();
      const expenseTransactions = monthlyTransactions.filter(t => parseFloat(t.amount) < 0);
      
      const categorySpending = new Map();
      expenseTransactions.forEach(t => {
        if (t.categoryId) {
          const current = categorySpending.get(t.categoryId) || 0;
          categorySpending.set(t.categoryId, current + Math.abs(parseFloat(t.amount)));
        }
      });
      
      // Create budget categories for categories that had spending
      const budgetCategories = [];
      const categoryEntries = Array.from(categorySpending.entries());
      
      for (const [categoryId, spending] of categoryEntries) {
        const category = categories.find(c => c.id === categoryId);
        if (category) {
          const budgetCategory = await storage.createBudgetCategory({
            budgetPeriodId: period.id,
            categoryId: categoryId,
            allocatedAmount: spending.toString(), // Start with actual spending as allocation
            spentAmount: spending.toString(),
            priority: category.type === 'income' ? 3 : category.name.toLowerCase().includes('rent') || 
                     category.name.toLowerCase().includes('mortgage') || 
                     category.name.toLowerCase().includes('utilities') ? 1 : 2,
            isFixed: category.name.toLowerCase().includes('rent') || 
                    category.name.toLowerCase().includes('mortgage') || 
                    category.name.toLowerCase().includes('insurance'),
          });
          budgetCategories.push(budgetCategory);
        }
      }
      
      res.json({
        message: "Budget period created from monthly statements",
        period,
        totalIncome: totalIncome.toString(),
        transactionCount: monthlyTransactions.length,
        categoriesCreated: budgetCategories.length,
        incomeSource: incomeAccount ? incomeAccount.customName || incomeAccount.accountHolderName : 'All accounts'
      });
      
    } catch (error) {
      console.error("Monthly sync error:", error);
      res.status(500).json({ error: "Failed to sync monthly budget" });
    }
  });

  // Recalculate dashboard metrics
  app.post("/api/recalculate/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Trigger a fresh calculation by invalidating cache and recalculating
      const accounts = await storage.getAccountsByUserId(userId);
      const transactions = await storage.getTransactionsByUserId(userId);
      const goals = await storage.getGoalsByUserId(userId);
      const transfers = await storage.getTransferRecommendationsByUserId(userId);
      
      const fireCalculator = new FireCalculator();
      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      
      res.json({ 
        message: "Dashboard recalculated successfully",
        metrics: fireMetrics,
        dataPoints: {
          accounts: accounts.length,
          transactions: transactions.length,
          goals: goals.length,
          transfers: transfers.length
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to recalculate dashboard" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
