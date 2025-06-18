import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { CamtParser } from "./services/camtParser";
import { TransactionCategorizer } from "./services/categorization";
import { FireCalculator } from "./services/fireCalculations";
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

      const results = {
        newAccounts: [] as any[],
        newTransactions: [] as any[],
        categorySuggestions: [] as any[]
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

      // Process transactions
      for (const transactionData of parsedStatement.transactions) {
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

      // Update goal account balances after processing all transactions
      await storage.updateGoalAccountBalances(userId);

      res.json({
        message: "Statement imported successfully",
        ...results,
        statementId: parsedStatement.statementId,
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to import statement" 
      });
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

      // Buffer transfer
      if (allocation.bufferAllocation > 0) {
        const bufferAccount = accounts.find(a => a.role === 'emergency') || 
                             goals.find(g => g.name.toLowerCase().includes('emergency'))?.linkedAccountId;
        
        if (bufferAccount) {
          const rec = await storage.createTransferRecommendation({
            userId,
            fromAccountId: mainAccount.id,
            toAccountId: typeof bufferAccount === 'number' ? bufferAccount : bufferAccount.id,
            amount: allocation.bufferAllocation.toString(),
            purpose: "Emergency buffer maintenance",
          });
          recommendations.push(rec);
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
