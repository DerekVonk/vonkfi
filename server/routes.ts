import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { CamtParser } from "./services/camtParser";
import { TransactionCategorizer } from "./services/categorization";
import { FireCalculator } from "./services/fireCalculations";
import { duplicateDetectionService } from "./services/duplicateDetection";
import { FixedExpenseAnalyzer } from "./services/fixedExpenseAnalyzer";
import { IntelligentTransferOptimizer } from "./services/intelligentTransferOptimizer";
import multer from "multer";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  const camtParser = new CamtParser();
  const fireCalculator = new FireCalculator();
  const fixedExpenseAnalyzer = new FixedExpenseAnalyzer();
  const intelligentTransferOptimizer = new IntelligentTransferOptimizer();

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

      // Temporarily disable duplicate detection to test CAMT parser balance allocation
      const uniqueTransactions = parsedStatement.transactions;
      const duplicateCount = 0;

      console.log(`Importing ${uniqueTransactions.length} transactions from CAMT file`);

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
          // Update last seen date and preserve CAMT balance from <Bal> tags
          await storage.updateAccount(existingAccount.id, {
            lastSeenDate: new Date(),
            balance: accountData.balance, // Preserve authentic CAMT balance
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

      // Skip hash creation temporarily to test CAMT parser corrections
      // if (results.newTransactions.length > 0) {
      //   const hashRecords = duplicateDetectionService.createHashRecords(results.newTransactions, userId);
      //   await storage.createTransactionHashBatch(hashRecords);
      // }

      // Skip balance recalculation to preserve authentic CAMT balance data from <Bal> tags
      // The CAMT parser extracts the correct closing balance directly from the bank statement
      // await storage.updateGoalAccountBalances(userId);

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
      
      // Skip automatic balance recalculation to preserve authentic CAMT balance data
      // Only update goal current amounts based on existing account balances (don't recalculate account balances)
      const userGoals = await storage.getGoalsByUserId(userId);
      const userAccounts = await storage.getAccountsByUserId(userId);
      
      for (const goal of userGoals) {
        if (goal.linkedAccountId) {
          const linkedAccount = userAccounts.find(acc => acc.id === goal.linkedAccountId);
          if (linkedAccount) {
            await storage.updateGoal(goal.id, { currentAmount: linkedAccount.balance });
          }
        }
      }
      
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
      
      // Clear ALL existing recommendations to prevent duplicates
      const existingRecommendations = await storage.getTransferRecommendationsByUserId(userId);
      for (const rec of existingRecommendations) {
        await storage.updateTransferRecommendationStatus(rec.id, 'replaced');
      }
      
      const [accounts, transactions, goals, transferPreferences] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId),
        storage.getTransferPreferencesByUserId(userId)
      ]);

      const fireMetrics = fireCalculator.calculateMetrics(transactions, goals, accounts);
      const allocation = fireCalculator.calculateAllocationRecommendation(
        fireMetrics.monthlyIncome,
        fireMetrics.monthlyExpenses,
        fireMetrics.bufferStatus.current,
        goals
      );

      // Initialize destination service
      const { TransferDestinationService } = await import('./services/transferDestinationService.js');
      const destinationService = new TransferDestinationService();

      // Generate transfer recommendations based on allocation
      const recommendations = [];
      const mainAccount = accounts.find(a => a.role === 'income') || accounts[0];
      
      if (!mainAccount) {
        return res.status(400).json({ error: "No main account found" });
      }

      // Buffer transfer using configurable destination service
      if (allocation.bufferAllocation > 0) {
        const destination = destinationService.resolveDestination(
          'buffer',
          accounts,
          goals,
          transferPreferences
        );
        
        if (destination) {
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: destination.accountId,
            amount: allocation.bufferAllocation.toString(),
            purpose: destination.purpose,
          });
          recommendations.push(rec);
        } else {
          // Create a recommendation to establish emergency fund
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: mainAccount.id, // Self-transfer note
            amount: allocation.bufferAllocation.toString(),
            purpose: `Create emergency fund: Set aside €${allocation.bufferAllocation.toFixed(2)} for emergency buffer`,
          });
          recommendations.push(rec);
        }
      }

      // Goal transfers using configurable destination service
      for (const goalAllocation of allocation.goalAllocations) {
        const destination = destinationService.resolveDestination(
          'goal',
          accounts,
          goals,
          transferPreferences,
          goalAllocation.goalId
        );
        
        if (destination) {
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: destination.accountId,
            amount: goalAllocation.amount.toString(),
            purpose: destination.purpose,
            goalId: goalAllocation.goalId,
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

  // Transfer Preferences API Routes
  app.get("/api/transfer-preferences/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const preferences = await storage.getTransferPreferencesByUserId(userId);
      res.json(preferences);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transfer preferences" });
    }
  });

  app.post("/api/transfer-preferences", async (req, res) => {
    try {
      const preferenceData = req.body;
      const preference = await storage.createTransferPreference(preferenceData);
      res.json(preference);
    } catch (error) {
      res.status(500).json({ error: "Failed to create transfer preference" });
    }
  });

  app.patch("/api/transfer-preferences/:preferenceId", async (req, res) => {
    try {
      const preferenceId = parseInt(req.params.preferenceId);
      const updates = req.body;
      
      const updated = await storage.updateTransferPreference(preferenceId, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update transfer preference" });
    }
  });

  app.delete("/api/transfer-preferences/:preferenceId", async (req, res) => {
    try {
      const preferenceId = parseInt(req.params.preferenceId);
      await storage.deleteTransferPreference(preferenceId);
      res.json({ message: "Transfer preference deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete transfer preference" });
    }
  });

  // Initialize default transfer preferences for a user
  app.post("/api/transfer-preferences/initialize/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Check if user already has preferences
      const existingPreferences = await storage.getTransferPreferencesByUserId(userId);
      if (existingPreferences.length > 0) {
        return res.json({ message: "User already has transfer preferences", preferences: existingPreferences });
      }

      // Create default preferences
      const { TransferDestinationService } = await import('./services/transferDestinationService.js');
      const destinationService = new TransferDestinationService();
      const defaultPreferences = destinationService.createDefaultPreferences(userId);
      
      const createdPreferences = [];
      for (const pref of defaultPreferences) {
        const created = await storage.createTransferPreference(pref);
        createdPreferences.push(created);
      }
      
      res.json({ message: "Default transfer preferences created", preferences: createdPreferences });
    } catch (error) {
      res.status(500).json({ error: "Failed to initialize transfer preferences" });
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

  // AI-Enhanced Vaste Lasten Optimization Endpoints
  
  // Analyze fixed expense patterns
  app.get("/api/ai/fixed-expenses/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const lookbackMonths = parseInt(req.query.months as string) || 12;
      
      const [transactions, categories] = await Promise.all([
        storage.getTransactionsByUserId(userId),
        storage.getCategories()
      ]);

      const patterns = fixedExpenseAnalyzer.analyzeFixedExpensePatterns(
        transactions, categories, lookbackMonths
      );

      res.json({
        patterns,
        totalPatterns: patterns.length,
        highConfidencePatterns: patterns.filter(p => p.confidence > 0.7).length,
        monthlyTotal: patterns.reduce((sum, p) => sum + p.averageAmount, 0)
      });
    } catch (error) {
      console.error("Fixed expense analysis error:", error);
      res.status(500).json({ error: "Failed to analyze fixed expenses" });
    }
  });

  // Predict Vaste Lasten requirements
  app.get("/api/ai/vaste-lasten-prediction/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const targetMonth = req.query.month ? new Date(req.query.month as string) : undefined;
      
      const [transactions, categories] = await Promise.all([
        storage.getTransactionsByUserId(userId),
        storage.getCategories()
      ]);

      const prediction = fixedExpenseAnalyzer.predictVasteLastenRequirements(
        transactions, categories, targetMonth
      );

      res.json(prediction);
    } catch (error) {
      console.error("Vaste Lasten prediction error:", error);
      res.status(500).json({ error: "Failed to predict Vaste Lasten requirements" });
    }
  });

  // Detect fixed expense anomalies
  app.get("/api/ai/expense-anomalies/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      const [transactions, categories] = await Promise.all([
        storage.getTransactionsByUserId(userId),
        storage.getCategories()
      ]);

      const patterns = fixedExpenseAnalyzer.analyzeFixedExpensePatterns(transactions, categories);
      const anomalies = fixedExpenseAnalyzer.detectFixedExpenseAnomalies(transactions, patterns);

      res.json({
        anomalies,
        totalAnomalies: anomalies.length,
        highSeverityAnomalies: anomalies.filter(a => a.severity === 'high').length,
        recentAnomalies: anomalies.filter(a => 
          new Date(a.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        ).length
      });
    } catch (error) {
      console.error("Expense anomaly detection error:", error);
      res.status(500).json({ error: "Failed to detect expense anomalies" });
    }
  });

  // Generate intelligent transfer recommendations
  app.get("/api/ai/intelligent-transfers/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      const [transactions, accounts, goals, preferences, categories] = await Promise.all([
        storage.getTransactionsByUserId(userId),
        storage.getAccountsByUserId(userId),
        storage.getGoalsByUserId(userId),
        storage.getTransferPreferencesByUserId(userId),
        storage.getCategories()
      ]);

      const recommendations = await intelligentTransferOptimizer.generateIntelligentRecommendations(
        userId, transactions, accounts, goals, preferences, categories
      );

      res.json({
        recommendations,
        totalRecommendations: recommendations.length,
        highPriorityRecommendations: recommendations.filter(r => r.priority === 'high').length,
        totalAmount: recommendations.reduce((sum, r) => sum + parseFloat(r.amount), 0),
        vasteLastenRecommendations: recommendations.filter(r => r.type === 'vaste_lasten').length
      });
    } catch (error) {
      console.error("Intelligent transfer generation error:", error);
      res.status(500).json({ error: "Failed to generate intelligent transfers" });
    }
  });

  // Optimize cash flow across accounts
  app.get("/api/ai/cashflow-optimization/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      const [accounts, transactions, goals] = await Promise.all([
        storage.getAccountsByUserId(userId),
        storage.getTransactionsByUserId(userId),
        storage.getGoalsByUserId(userId)
      ]);

      const optimization = await intelligentTransferOptimizer.optimizeCashFlow(
        accounts, transactions, goals
      );

      res.json(optimization);
    } catch (error) {
      console.error("Cash flow optimization error:", error);
      res.status(500).json({ error: "Failed to optimize cash flow" });
    }
  });

  // Execute AI-recommended transfer (creates transfer recommendation)
  app.post("/api/ai/execute-transfer/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { fromAccountId, toAccountId, amount, reason, type } = req.body;

      // Validate input
      if (!fromAccountId || !toAccountId || !amount || !reason) {
        return res.status(400).json({ error: "Missing required transfer parameters" });
      }

      // Create transfer recommendation based on AI analysis
      const transferRecommendation = await storage.createTransferRecommendation({
        userId,
        fromAccountId: parseInt(fromAccountId),
        toAccountId: parseInt(toAccountId),
        amount: parseFloat(amount).toFixed(2),
        purpose: `AI Optimized: ${reason}`,
        status: 'pending'
      });

      res.json({
        message: "AI transfer recommendation created successfully",
        recommendation: transferRecommendation,
        type: type || 'optimization'
      });
    } catch (error) {
      console.error("AI transfer execution error:", error);
      res.status(500).json({ error: "Failed to execute AI transfer recommendation" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
