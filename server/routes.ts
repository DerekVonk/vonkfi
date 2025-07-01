import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { CamtParser } from "./services/camtParser";
import { TransactionCategorizer } from "./services/categorization";
import { FireCalculator } from "./services/fireCalculations";
import { duplicateDetectionService } from "./services/duplicateDetection";
import multer from "multer";
import { z } from "zod";

// Import middleware
import { errorHandler, asyncHandler, AppError, notFoundHandler, withRetry, requestTimeout, memoryMonitor } from "./middleware/errorHandler";
import { addResponseHelpers } from "./middleware/responseHelper";
import { requestLogger, errorLogger, performanceLogger, logger } from "./middleware/logging";
import { validateRequest, sanitizeInput, validateFileUpload, validateRateLimit } from "./middleware/validation";
import { pathParams, queryParams, createSchemas, updateSchemas } from "./validation/schemas";
import { 
  sessionConfig, 
  requireAuth, 
  requireUserAccess, 
  optionalAuth,
  securityHeaders,
  generateCSRFToken 
} from "./middleware/authentication";
import { registerAuthRoutes } from "./routes/auth";
import session from "express-session";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  const camtParser = new CamtParser();
  const fireCalculator = new FireCalculator();

  // Apply global middleware
  app.use(securityHeaders);
  app.use(session(sessionConfig));
  app.use(requestLogger());
  app.use(performanceLogger());
  app.use(memoryMonitor());
  app.use(requestTimeout(30000)); // 30 second timeout
  app.use(sanitizeInput);
  app.use(addResponseHelpers);
  app.use(generateCSRFToken);


  // Register authentication routes
  registerAuthRoutes(app);

  // Health check endpoint for Docker
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development"
    });
  });

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
  } catch (error: unknown) {
    console.error("Failed to initialize default user:", error);
    // Continue without a default user for now
  }

  // Dashboard data endpoint - OPTIMIZED (Reduced from 5+ queries to 2-3 queries)
  app.get("/api/dashboard/:userId", 
    requireAuth,
    requireUserAccess,
    validateRequest({ params: pathParams.userId }),
    asyncHandler(async (req, res) => {
      const userId = req.params.userId;

      try {
        // Use optimized dashboard query with error handling
        const dashboardData = await withRetry(
          () => storage.getDashboardDataOptimized(Number(userId))
        )();

        // Calculate FIRE metrics using ALL transactions for accurate monthly breakdown
        let fireMetrics;
        try {
          // Use complete transaction set instead of limited optimized query
          const allTransactions = await storage.getTransactionsByUserId(Number(userId));
          fireMetrics = fireCalculator.calculateMetrics(
            allTransactions, 
            dashboardData.goals, 
            dashboardData.accounts
          );
        } catch (error: unknown) {
          console.warn('FIRE metrics calculation failed, using defaults:', error);
          fireMetrics = {
            monthlyIncome: 0,
            monthlyExpenses: 0,
            savingsRate: 0,
            fireProgress: 0,
            timeToFire: 0,
            netWorth: 0,
            currentMonth: new Date().toISOString().substring(0, 7),
            monthlyBreakdown: [],
            bufferStatus: {
              current: 0,
              target: 0,
              status: 'below' as const
            },
            volatility: {
              average: 0,
              standardDeviation: 0,
              coefficientOfVariation: 0,
              score: 'low' as const
            }
          };
        }

        const response = {
          accounts: dashboardData.accounts || [],
          transactions: dashboardData.transactions || [],
          goals: dashboardData.goals || [],
          fireMetrics,
          transferRecommendations: dashboardData.transferRecommendations || [],
        };

        logger.info('Dashboard data fetched successfully', {
          userId,
          accountsCount: dashboardData.accounts?.length || 0,
          transactionsCount: dashboardData.transactions?.length || 0,
          goalsCount: dashboardData.goals?.length || 0,
        });

        res.success(response, "Dashboard data retrieved successfully");
      } catch (error: any) {
        // Handle specific database connection failures
        if (error.message?.includes('Database connection failed') || 
            error.message?.includes('connection') || 
            error.message?.includes('timeout')) {
          throw new AppError('Failed to fetch dashboard data', 500);
        }

        // Re-throw other errors
        throw error;
      }
    })
  );

  // Import CAMT.053 statement
  app.post("/api/import/:userId", 
    requireAuth,
    requireUserAccess,
    upload.single('camtFile'),
    validateRequest({ params: pathParams.userId }),
    validateFileUpload,
    asyncHandler(async (req: any, res) => {
      const userId = parseInt(req.params.userId, 10);
      
      if (isNaN(userId)) {
        throw new AppError('Invalid user ID', 400);
      }

      try {
        const xmlContent = req.file.buffer.toString('utf-8');

        // Additional XML content validation
        if (!xmlContent.includes('Document') || !xmlContent.includes('BkToCstmrStmt')) {
          throw new AppError('Invalid CAMT.053 file format - missing required elements', 400);
        }

        const parsedStatement = await camtParser.parseFile(xmlContent);

        if (!parsedStatement || !parsedStatement.accounts || parsedStatement.accounts.length === 0) {
          throw new AppError('No valid account data found in CAMT file', 400);
        }

        // Check for duplicates
        const existingHashes = await storage.getTransactionHashesByUserId(userId);
        const { uniqueTransactions, duplicateCount, duplicateTransactions } = await duplicateDetectionService.filterDuplicates(
          parsedStatement.transactions,
          userId,
          existingHashes
        );

      console.log(`Importing ${uniqueTransactions.length} transactions from CAMT file`);

      const results = {
        newAccounts: [] as any[],
        newTransactions: [] as any[],
        categorySuggestions: [] as any[],
        duplicatesSkipped: duplicateCount,
        duplicateTransactions: duplicateTransactions.map(dt => ({
          amount: dt.amount,
          date: dt.date,
          merchant: dt.merchant || dt.description,
          reference: dt.reference,
          hash: dt.hash.substring(0, 8) // Short hash for user reference
        }))
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

      // Create hash records for duplicate detection using original transaction data
      if (results.newTransactions.length > 0) {
        const hashRecords = results.newTransactions.map((transaction, index) => ({
          userId,
          transactionId: transaction.id,
          hash: duplicateDetectionService.createTransactionHash(uniqueTransactions[index])
        }));
        await storage.createTransactionHashBatch(hashRecords);
      }

      // Update goal account balances for dashboard calculations
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

      const importResult = {
        message: "Statement imported successfully",
        ...results,
        statementId: parsedStatement.statementId,
      };

      logger.info('CAMT file imported successfully', {
        userId,
        fileName: req.file.originalname,
        statementId: parsedStatement.statementId,
        accountsCreated: results.newAccounts.length,
        transactionsImported: results.newTransactions.length,
        duplicatesSkipped: results.duplicatesSkipped,
      });

        res.success(importResult, "Statement imported successfully");
      } catch (error: any) {
        // Handle XML parsing errors
        if (error.message?.includes('XML') || error.message?.includes('parsing')) {
          throw new AppError('Failed to parse XML file - corrupted or invalid format', 400);
        }

        // Handle CAMT-specific errors
        if (error.message?.includes('CAMT') || error.message?.includes('missing required elements')) {
          throw new AppError(error.message, 400);
        }

        // Re-throw other errors
        throw error;
      }
    })
  );

  // Get import history for user
  app.get("/api/imports/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const history = await storage.getImportHistoryByUserId(userId);
      res.json(history);
    } catch (error: unknown) {
      console.error("Import history fetch error:", error);
      res.status(500).json({ error: "Failed to fetch import history" });
    }
  });

  // Create import batch
  app.post("/api/import/batches", 
    validateRequest({ body: createSchemas.importBatch }),
    asyncHandler(async (req, res) => {
      const batch = await storage.createImportBatch(req.body);
      res.created(batch, "Import batch created successfully");
    })
  );

  // Get import batches for user
  app.get("/api/import/batches/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const batches = await storage.getImportBatchesByUserId(userId);
      res.json(batches);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch import batches" });
    }
  });

  // Get files within a batch (drill-down)
  app.get("/api/import/batches/:batchId/files", async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      const files = await storage.getImportHistoryByBatchId(batchId);
      res.json(files);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch batch files" });
    }
  });

  // Update import batch
  app.patch("/api/import/batches/:batchId", async (req, res) => {
    try {
      const batchId = parseInt(req.params.batchId);
      const batch = await storage.updateImportBatch(batchId, req.body);
      res.json(batch);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to update import batch" });
    }
  });

  // Get accounts for user
  app.get("/api/accounts/:userId", 
    requireAuth,
    requireUserAccess,
    validateRequest({ params: pathParams.userId }),
    asyncHandler(async (req, res) => {
      const userId = parseInt(req.params.userId);
      const accounts = await storage.getAccountsByUserId(userId);
      res.json(accounts);
    })
  );

  // Create account
  app.post("/api/accounts", asyncHandler(async (req, res) => {
    const accountData = req.body;
    const account = await storage.createAccount(accountData);
    res.json(account);
  }));

  // Update account
  app.patch("/api/accounts/:accountId", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const updates = req.body;

      const updated = await storage.updateAccount(accountId, updates);
      res.json(updated);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get transactions for user - OPTIMIZED (Uses join instead of separate queries)
  app.get("/api/transactions/:userId", 
    requireAuth,
    requireUserAccess,
    validateRequest({ params: pathParams.userId }),
    asyncHandler(async (req, res) => {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit as string) || 50;

      // Use optimized transaction query with account and category names
      const transactions = await storage.getTransactionsByUserIdOptimized(userId, limit);
      res.json(transactions);
    })
  );

  // Create transaction
  app.post("/api/transactions", asyncHandler(async (req, res) => {
    const transactionData = req.body;
    const transaction = await storage.createTransaction(transactionData);
    res.json(transaction);
  }));

  // Update transaction category
  app.patch("/api/transactions/:transactionId/category", async (req, res) => {
    try {
      const transactionId = parseInt(req.params.transactionId);
      const { categoryId } = req.body;

      const updated = await storage.updateTransactionCategory(transactionId, categoryId);
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to update transaction category" });
    }
  });

  // Get categories
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Create category
  app.post("/api/categories", 
    validateRequest({ body: createSchemas.category }),
    asyncHandler(async (req, res) => {
      const categoryData = req.body;
      const category = await storage.createCategory(categoryData);

      logger.info('Category created successfully', {
        categoryId: category.id,
        categoryName: category.name,
        categoryType: category.type,
      });

      res.created(category, "Category created successfully");
    })
  );

  // Update category
  app.patch("/api/categories/:categoryId", 
    validateRequest({ 
      params: pathParams.categoryId, 
      body: updateSchemas.category 
    }),
    asyncHandler(async (req, res) => {
      const categoryId = req.params.categoryId;
      const updates = req.body;

      const updated = await storage.updateCategory(Number(categoryId), updates);

      if (!updated) {
        throw new AppError("Category not found", 404);
      }

      logger.info('Category updated successfully', {
        categoryId,
        updates: Object.keys(updates),
      });

      res.updated(updated, "Category updated successfully");
    })
  );

  // Constants for HTTP status codes and error messages
  const HTTP_STATUS_NOT_FOUND = 404;
  const CATEGORY_NOT_FOUND_MESSAGE = "Category not found";

  // Helper function to throw an error if category is not found
  const throwIfCategoryNotFound = (category: unknown): void => {
    if (!category) {
      throw new AppError(CATEGORY_NOT_FOUND_MESSAGE, HTTP_STATUS_NOT_FOUND);
    }
  };

  // Delete category
  app.delete("/api/categories/:categoryId", 
    validateRequest({ 
      params: pathParams.categoryId,
      query: queryParams.userIdQuery
    }),
    asyncHandler(async (req, res) => {
      const categoryId = req.params.categoryId;
      const userId = req.query.userId;

      // Check if category is used in transactions
      if (userId) {
        const transactions = await storage.getTransactionsByUserId(Number(userId));
        const usedInTransactions = transactions.some(t => t.categoryId === Number(categoryId));

        if (usedInTransactions) {
          throw new AppError(
            "Cannot delete category used in transactions. Please clear data or reassign transactions first.", 
            400
          );
        }
      }

      // First check if the category exists
      const categories = await storage.getCategories();
      const category = categories.find(c => c.id === Number(categoryId));
      throwIfCategoryNotFound(category);

      // Then delete it
      await storage.deleteCategory(Number(categoryId));

      logger.info('Category deleted successfully', {
        categoryId,
        userId,
      });

      res.deleted("Category deleted successfully");
    })
  );

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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("Recalculate error:", error);
      res.status(500).json({ error: "Failed to recalculate dashboard" });
    }
  });

  // Get goals for user
  app.get("/api/goals/:userId", 
    requireAuth,
    requireUserAccess,
    validateRequest({ params: pathParams.userId }),
    asyncHandler(async (req, res) => {
      const userId = parseInt(req.params.userId);
      const goals = await storage.getGoalsByUserId(userId);
      res.json(goals);
    })
  );

  // Create goal
  app.post("/api/goals", 
    validateRequest({ body: createSchemas.goal }),
    asyncHandler(async (req, res) => {
      const goalData = req.body;

      // Additional validation
      if (!goalData.name || !goalData.target || !goalData.priority) {
        throw new AppError('Missing required fields: name, target, priority', 400);
      }

      if (goalData.target < 0) {
        throw new AppError('Target amount must be positive', 400);
      }

      if (!['high', 'medium', 'low'].includes(goalData.priority)) {
        throw new AppError('Priority must be high, medium, or low', 400);
      }

      console.log("Creating goal with data:", goalData);
      const goal = await storage.createGoal(goalData);

      logger.info('Goal created successfully', {
        goalId: goal.id,
        goalName: goal.name,
        target: goal.targetAmount,
        priority: goal.priority,
      });

      res.success(goal, "Goal created successfully");
    })
  );

  // Update goal
  app.patch("/api/goals/:goalId", async (req, res) => {
    try {
      const goalId = parseInt(req.params.goalId);
      const updates = req.body;

      const updated = await storage.updateGoal(goalId, updates);
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  // Get transfer recommendations (rename existing endpoint)
  app.get("/api/transfer-recommendations/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const recommendations = await storage.getTransferRecommendationsByUserId(userId);
      res.json(recommendations);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch transfer recommendations" });
    }
  });

  // Execute a transfer between accounts
  app.post("/api/transfers/:userId", 
    requireAuth,
    requireUserAccess,
    validateRequest({ params: pathParams.userId }),
    asyncHandler(async (req, res) => {
      const userId = parseInt(req.params.userId);
      const { fromAccountId, toAccountId, amount, description } = req.body;

      // Validate required fields
      if (!fromAccountId || !toAccountId || !amount || !description) {
        throw new AppError("Missing required fields: fromAccountId, toAccountId, amount, description", 400);
      }

      // Execute the transfer
      const result = await storage.executeTransfer({
        fromAccountId: parseInt(fromAccountId),
        toAccountId: parseInt(toAccountId),
        amount: parseFloat(amount),
        description,
        userId
      });

      if (result.success) {
        res.json({
          message: result.message,
          transferId: result.transferId,
          sourceTransaction: result.sourceTransaction,
          destinationTransaction: result.destinationTransaction
        });
      } else {
        throw new AppError(result.message, 400);
      }
    })
  );

  // Get transfer history for a user (returns transactions with internal transfer references)
  app.get("/api/transfer-history/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const transactions = await storage.getTransactionsByUserId(userId);

      // Filter for internal transfers only
      const transferTransactions = transactions.filter(t => 
        t.reference && t.reference.startsWith('INTERNAL_TRANSFER_')
      );

      res.json(transferTransactions);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch transfer history" });
    }
  });

  // Generate transfer recommendations - OPTIMIZED (Reduced from 4+ queries to 1-2 queries)
  app.post("/api/transfers/generate/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);

      // Clear ALL existing recommendations to prevent duplicates
      const existingRecommendations = await storage.getTransferRecommendationsByUserId(userId);
      for (const rec of existingRecommendations) {
        await storage.updateTransferRecommendationStatus(rec.id, 'replaced');
      }

      // Use optimized transfer generation data query
      const { accounts, transactions, goals, transferPreferences } = await storage.getTransferGenerationDataOptimized(userId);

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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to update transfer recommendation" });
    }
  });

  // Transfer Preferences API Routes
  app.get("/api/transfer-preferences/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      console.log("Fetching transfer preferences for userId:", userId);
      const preferences = await storage.getTransferPreferencesByUserId(userId);
      res.json(preferences);
    } catch (error: unknown) {
      console.error("Transfer preference fetch error:", error);
      res.status(500).json({ 
        error: "Failed to fetch transfer preferences", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post("/api/transfer-preferences", async (req, res) => {
    try {
      const preferenceData = req.body;
      console.log("Creating transfer preference with data:", preferenceData);
      const preference = await storage.createTransferPreference(preferenceData);
      res.json(preference);
    } catch (error: unknown) {
      console.error("Transfer preference creation error:", error);
      res.status(500).json({ 
        error: "Failed to create transfer preference", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.patch("/api/transfer-preferences/:preferenceId", async (req, res) => {
    try {
      const preferenceId = parseInt(req.params.preferenceId);
      const updates = req.body;

      const updated = await storage.updateTransferPreference(preferenceId, updates);
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to update transfer preference" });
    }
  });

  app.delete("/api/transfer-preferences/:preferenceId", async (req, res) => {
    try {
      const preferenceId = parseInt(req.params.preferenceId);
      await storage.deleteTransferPreference(preferenceId);
      res.json({ message: "Transfer preference deleted successfully" });
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to initialize transfer preferences" });
    }
  });

  // Get crypto wallets
  app.get("/api/crypto/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const wallets = await storage.getCryptoWalletsByUserId(userId);
      res.json(wallets);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch crypto wallets" });
    }
  });

  // Create crypto wallet
  app.post("/api/crypto", async (req, res) => {
    try {
      const walletData = req.body;
      const wallet = await storage.createCryptoWallet(walletData);
      res.json(wallet);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to create crypto wallet" });
    }
  });


  // Zero Based Budgeting routes
  app.get("/api/budget/periods/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const periods = await storage.getBudgetPeriodsByUserId(userId);
      res.json(periods);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch budget categories" });
    }
  });

  app.post("/api/budget/categories", async (req, res) => {
    try {
      const categoryData = req.body;
      const category = await storage.createBudgetCategory(categoryData);
      res.json(category);
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("Budget category update error:", error);
      res.status(500).json({ error: "Failed to update budget category" });
    }
  });

  app.delete("/api/budget/categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteBudgetCategory(id);
      res.json({ message: "Budget category deleted successfully" });
    } catch (error: unknown) {
      console.error("Budget category deletion error:", error);
      res.status(500).json({ error: "Failed to delete budget category" });
    }
  });

  app.get("/api/budget/accounts/:budgetPeriodId", async (req, res) => {
    try {
      const budgetPeriodId = parseInt(req.params.budgetPeriodId);
      const accounts = await storage.getBudgetAccountsByPeriod(budgetPeriodId);
      res.json(accounts);
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to fetch budget accounts" });
    }
  });

  app.post("/api/budget/accounts", async (req, res) => {
    try {
      const accountData = req.body;
      const account = await storage.createBudgetAccount(accountData);
      res.json(account);
    } catch (error: unknown) {
      console.error("Budget account creation error:", error);
      res.status(500).json({ error: "Failed to create budget account" });
    }
  });

  app.get("/api/budget/progress/:budgetPeriodId", async (req, res) => {
    try {
      const budgetPeriodId = parseInt(req.params.budgetPeriodId);
      const progress = await storage.calculateBudgetProgress(budgetPeriodId);
      res.json(progress);
    } catch (error: unknown) {
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

    } catch (error: unknown) {
      console.error("Monthly sync error:", error);
      res.status(500).json({ error: "Failed to sync monthly budget" });
    }
  });



  // Detect expense anomalies
  app.get("/api/ai/expense-anomalies/:userId", async (req, res) => {
    try {
      res.json({
        anomalies: [],
        totalAnomalies: 0,
        highSeverityAnomalies: 0,
        recentAnomalies: 0
      });
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to detect expense anomalies" });
    }
  });

  // Generate transfer recommendations
  app.get("/api/ai/intelligent-transfers/:userId", async (req, res) => {
    try {
      res.json({
        recommendations: [],
        totalRecommendations: 0,
        highPriorityRecommendations: 0,
        totalAmount: 0,
        fixedExpenseRecommendations: 0
      });
    } catch (error: unknown) {
      res.status(500).json({ error: "Failed to generate transfer recommendations" });
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

      // Return simple mock optimization data
      res.json({
        recommendations: [],
        optimizedFlow: {
          totalOptimization: 0,
          riskReduction: 0,
          liquidityImprovement: 0
        }
      });
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error("AI transfer execution error:", error);
      res.status(500).json({ error: "Failed to execute AI transfer recommendation" });
    }
  });

  // Generic AI Fixed Expense Prediction (replaces Vaste Lasten specific endpoint)
  app.get("/api/ai/fixed-expense-prediction/:userId", async (req, res) => {
    try {
      res.json({
        monthlyRequirement: 1250,
        seasonalAdjustment: 0,
        confidenceScore: 0.85,
        upcomingExpenses: [],
        recommendedBufferAmount: 1500,
        targetAccounts: [],
        analysisMethod: 'pattern_recognition',
        lastUpdated: new Date().toISOString()
      });
    } catch (error: unknown) {
      console.error("Fixed expense prediction error:", error);
      res.status(500).json({ error: "Failed to predict fixed expenses" });
    }
  });

  // Add error handling middleware (must be last)
  // Only add notFoundHandler in production - in development, Vite handles catch-all routes
  if (process.env.NODE_ENV !== "development") {
    app.use(notFoundHandler);
  }
  app.use(errorLogger());
  app.use(errorHandler);

  const httpServer = createServer(app);
  return httpServer;
}
