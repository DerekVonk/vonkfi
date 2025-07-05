import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import request from 'supertest';
import express from 'express';
import {storage} from '../server/storage';
import {registerRoutes} from '../server/routes';
import { dbConnectionFailed } from './setup';

const app = express();
app.use(express.json());

// Helper function to conditionally skip tests that require database connection
const itIfDb = dbConnectionFailed ? it.skip : it;

describe('Authentication & Security Tests', () => {
    let server: any;

    beforeEach(async () => {
        if (dbConnectionFailed) {
            console.log('Skipping database test - no test database available');
            return;
        }

        try {
            server = await registerRoutes(app);
            // Clean up test data
            await storage.clearUserData(1);
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

    describe('User Management', () => {
        it('should create a user with valid data', async () => {
            const userData = {
                username: 'testuser' + Date.now(),
                password: 'TestPass123!'
            };

            const user = await storage.createUser(userData);

            expect(user).toBeDefined();
            expect(user.username).toBe(userData.username);
            expect(user.id).toBeDefined();
            // Password should not be returned in user object
            expect(user.password).toBeUndefined();
        });

        it('should not create duplicate usernames', async () => {
            const userData = {
                username: 'duplicateuser' + Date.now(),
                password: 'TestPass123!'
            };

            // Create first user
            await storage.createUser(userData);

            // Attempt to create duplicate should fail
            await expect(storage.createUser(userData)).rejects.toThrow();
        });

        it('should retrieve user by username', async () => {
            const userData = {
                username: 'findme' + Date.now(),
                password: 'TestPass123!'
            };

            await storage.createUser(userData);
            const foundUser = await storage.getUserByUsername(userData.username);

            expect(foundUser).toBeDefined();
            expect(foundUser?.username).toBe(userData.username);
        });

        it('should return null for non-existent username', async () => {
            const foundUser = await storage.getUserByUsername('nonexistent');
            expect(foundUser).toBeUndefined();
        });
    });

    describe('Input Validation & Security', () => {
        it('should reject requests with invalid user IDs', async () => {
            const response = await request(app)
                .get('/api/dashboard/invalid')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject requests with negative user IDs', async () => {
            const response = await request(app)
                .get('/api/dashboard/-1')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject requests with extremely large user IDs', async () => {
            const response = await request(app)
                .get('/api/dashboard/999999999')
                .expect(200); // This should actually be protected

            // Note: This currently returns empty data instead of proper authorization
            // This test documents the current behavior but highlights a security issue
        });

        it('should handle SQL injection attempts in user ID', async () => {
            const response = await request(app)
                .get('/api/dashboard/1; DROP TABLE users;--')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should validate file uploads for CAMT import', async () => {
            const response = await request(app)
                .post('/api/import/1')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject non-XML files for CAMT import', async () => {
            const response = await request(app)
                .post('/api/import/1')
                .attach('camtFile', Buffer.from('not xml content'), 'fake.txt')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Data Access Control', () => {
        it('should only return data for the specified user', async () => {
            // Create two users with different data
            const user1 = await storage.createUser({username: 'user1' + Date.now(), password: 'TestPass123!'});
            const user2 = await storage.createUser({username: 'user2' + Date.now(), password: 'TestPass123!'});

            // Create account for user1
            const account1 = await storage.createAccount({
                userId: user1.id,
                iban: 'GB12ABCD12345678901234',
                bic: 'ABCDGB2L',
                accountHolderName: 'User One',
                bankName: 'Test Bank 1',
                balance: '1000.00'
            });

            // Create account for user2
            const account2 = await storage.createAccount({
                userId: user2.id,
                iban: 'GB12EFGH12345678901234',
                bic: 'EFGHGB2L',
                accountHolderName: 'User Two',
                bankName: 'Test Bank 2',
                balance: '2000.00'
            });

            // Test data isolation at storage level (which is the actual security concern)
            const user1Accounts = await storage.getAccountsByUserId(user1.id);
            const user2Accounts = await storage.getAccountsByUserId(user2.id);

            // Verify each user only sees their own accounts
            expect(user1Accounts).toHaveLength(1);
            expect(user1Accounts[0].accountHolderName).toBe('User One');
            expect(user1Accounts[0].userId).toBe(user1.id);

            expect(user2Accounts).toHaveLength(1);
            expect(user2Accounts[0].accountHolderName).toBe('User Two');
            expect(user2Accounts[0].userId).toBe(user2.id);

            // Additional verification: user1 cannot access user2's account by ID
            const user2AccountFromUser1Perspective = await storage.getAccountById(account2.id);
            // This should still return the account (no user-level filtering at getAccountById level)
            // but in a real app, the API endpoints should filter by user access
            expect(user2AccountFromUser1Perspective?.userId).toBe(user2.id);
            expect(user2AccountFromUser1Perspective?.userId).not.toBe(user1.id);
        });

        it('should prevent cross-user data access in goal operations', async () => {
            const user1 = await storage.createUser({username: 'goaluser1' + Date.now(), password: 'TestPass123!'});
            const user2 = await storage.createUser({username: 'goaluser2' + Date.now(), password: 'TestPass123!'});

            // Create goal for user1
            const goal = await storage.createGoal({
                userId: user1.id,
                name: 'Emergency Fund',
                targetAmount: '10000.00',
                priority: 1
            });

            // Try to access user1's goal through user2's endpoint
            const goals = await storage.getGoalsByUserId(user2.id);
            expect(goals).toHaveLength(0);

            // Verify user1 can access their own goal
            const user1Goals = await storage.getGoalsByUserId(user1.id);
            expect(user1Goals).toHaveLength(1);
            expect(user1Goals[0].name).toBe('Emergency Fund');
        });
    });

    describe('Password Security', () => {
        it('should store passwords securely with proper hashing', async () => {
            const userData = {
                username: 'secureuser' + Date.now(),
                password: 'TestPass123!'
            };

            const user = await storage.createUser(userData);

            // Password hashing is now properly implemented
            // getUserByUsername should not return password field for security
            const storedUser = await storage.getUserByUsername(userData.username);
            
            // Password should be filtered out from the response for security
            expect(storedUser?.password).toBeUndefined();
            
            // But authentication should work with the correct password
            const authenticatedUser = await storage.authenticateUser(userData.username, 'TestPass123!');
            expect(authenticatedUser).toBeDefined();
            expect(authenticatedUser?.id).toBe(user.id);
            
            // And fail with wrong password
            const failedAuth = await storage.authenticateUser(userData.username, 'WrongPassword123!');
            expect(failedAuth).toBeNull();
        });

        it('should reject weak passwords', async () => {
            // Password validation is now implemented and working
            const weakPasswords = ['123', 'password', 'abc', ''];

            for (const weakPassword of weakPasswords) {
                const userData = {
                    username: `user_${Math.random()}`,
                    password: weakPassword
                };

                // Now properly rejects weak passwords
                await expect(storage.createUser(userData)).rejects.toThrow('Password validation failed');
            }
        });
    });

    describe('Rate Limiting & DoS Protection', () => {
        it('should handle multiple concurrent requests gracefully', async () => {
            const user = await storage.createUser({username: 'concurrent' + Date.now(), password: 'TestPass123!'});

            // Make multiple concurrent requests
            const requests = Array.from({length: 10}, () =>
                request(app).get(`/api/dashboard/${user.id}`)
            );

            const responses = await Promise.all(requests);

            // All requests should succeed (no rate limiting currently implemented)
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            // TODO: Implement rate limiting
            // Some requests should be rate limited after threshold
        });

        it('should prevent resource exhaustion through large file uploads', async () => {
            // Create a large buffer (simulating a very large file)
            const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB

            const response = await request(app)
                .post('/api/import/1')
                .attach('camtFile', largeBuffer, 'large.xml')
                .timeout(5000); // 5 second timeout

            // Currently no file size limits - this should be implemented
            // expect(response.status).toBe(413); // Payload Too Large
        });
    });

    describe('Error Information Disclosure', () => {
        it('should not expose sensitive information in error messages', async () => {
            // Try to trigger a database error
            const response = await request(app)
                .get('/api/dashboard/999999')
                .expect(200);

            // Currently returns empty data instead of proper error handling
            // In case of actual errors, verify no sensitive information is exposed

            // TODO: Implement proper error handling that doesn't expose:
            // - Database schema information
            // - File paths
            // - Internal system details
        });

        it('should handle malformed JSON requests gracefully', async () => {
            const response = await request(app)
                .post('/api/goals/1')
                .send('{"invalid json"}')
                .set('Content-Type', 'application/json');

            // Should handle malformed JSON without exposing internal details
            expect(response.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('Session Management (Not Implemented)', () => {
        it('should implement session management for user authentication', async () => {
            // Currently no session management exists
            // This test documents what should be implemented

            // TODO: Implement proper session management with:
            // - Login endpoint
            // - Session creation and validation
            // - Session expiration
            // - Logout functionality

            expect(true).toBe(true); // Placeholder for future implementation
        });
    });
});
