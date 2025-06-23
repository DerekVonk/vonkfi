import type { Express } from "express";
import { storage } from "../storage";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { validateRequest } from "../middleware/validation";
import { 
  loginSchema, 
  registrationSchema, 
  SessionManager,
  requireAuth 
} from "../middleware/authentication";
import { z } from "zod";

/**
 * Register authentication routes
 */
export function registerAuthRoutes(app: Express) {
  
  // User registration
  app.post("/api/auth/register", 
    validateRequest({ body: registrationSchema }),
    asyncHandler(async (req, res) => {
      const { username, password } = req.body;

      try {
        // Create user with hashed password
        const user = await storage.createUser({ username, password });
        
        // Create session for newly registered user
        await SessionManager.createSession(req, user);

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          user: {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt
          }
        });
      } catch (error: any) {
        if (error.message.includes('Username already exists')) {
          throw new AppError('Username already exists', 409);
        } else if (error.message.includes('Password validation failed')) {
          throw new AppError(error.message, 400);
        }
        throw new AppError('Registration failed', 500);
      }
    })
  );

  // User login
  app.post("/api/auth/login",
    validateRequest({ body: loginSchema }),
    asyncHandler(async (req, res) => {
      const { username, password } = req.body;

      // Authenticate user
      const user = await storage.authenticateUser(username, password);
      
      if (!user) {
        throw new AppError('Invalid username or password', 401);
      }

      // Create session
      await SessionManager.createSession(req, user);
      
      // Regenerate session ID to prevent session fixation
      await SessionManager.regenerateSession(req);

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt
        }
      });
    })
  );

  // User logout
  app.post("/api/auth/logout",
    requireAuth,
    asyncHandler(async (req, res) => {
      await SessionManager.destroySession(req);
      
      res.json({
        success: true,
        message: "Logout successful"
      });
    })
  );

  // Get current user
  app.get("/api/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await storage.getUser(req.user!.id);
      
      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt
        }
      });
    })
  );

  // Change password
  app.post("/api/auth/change-password",
    requireAuth,
    validateRequest({ 
      body: z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters')
      })
    }),
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      // Verify current password
      const user = await storage.getUserByUsername(req.user!.username);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const isValidCurrentPassword = await storage.authenticateUser(user.username, currentPassword);
      if (!isValidCurrentPassword) {
        throw new AppError('Current password is incorrect', 401);
      }

      // Update password
      await storage.updateUserPassword(userId, newPassword);

      res.json({
        success: true,
        message: "Password changed successfully"
      });
    })
  );

  // Validate session (useful for frontend to check if user is still authenticated)
  app.get("/api/auth/validate",
    asyncHandler(async (req, res) => {
      const isValid = await SessionManager.validateSession(req);
      
      res.json({
        success: true,
        isAuthenticated: isValid,
        user: isValid && req.user ? {
          id: req.user.id,
          username: req.user.username
        } : null
      });
    })
  );
}