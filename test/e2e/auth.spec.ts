import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form on homepage', async ({ page }) => {
    // Check if login form is visible
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('input[name="username"], input[type="text"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials
    await page.fill('input[name="username"], input[type="text"]', 'invalid_user');
    await page.fill('input[name="password"], input[type="password"]', 'invalid_password');
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    
    // Check for error message
    await expect(page.locator('text=Invalid credentials, text=Login failed, text=Authentication failed')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    // Fill in valid test credentials
    await page.fill('input[name="username"], input[type="text"]', 'e2e_test_user');
    await page.fill('input[name="password"], input[type="password"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard|.*\/accounts|.*\/home/);
    
    // Check for dashboard elements
    await expect(page.locator('text=Dashboard, text=Accounts, text=Balance')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.fill('input[name="username"], input[type="text"]', 'e2e_test_user');
    await page.fill('input[name="password"], input[type="password"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    
    // Wait for login to complete
    await page.waitForURL(/.*\/dashboard|.*\/accounts|.*\/home/);
    
    // Find and click logout button
    await page.click('button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout")');
    
    // Should redirect back to login
    await expect(page).toHaveURL(/.*\/login|.*\/$/);
    await expect(page.locator('input[name="username"], input[type="text"]')).toBeVisible();
  });

  test('should prevent access to protected pages without authentication', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('/dashboard');
    
    // Should redirect to login or show unauthorized message
    await expect(page).toHaveURL(/.*\/login|.*\/$/);
  });

  test('should handle session persistence', async ({ page }) => {
    // Login
    await page.fill('input[name="username"], input[type="text"]', 'e2e_test_user');
    await page.fill('input[name="password"], input[type="password"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    
    await page.waitForURL(/.*\/dashboard|.*\/accounts|.*\/home/);
    
    // Reload page
    await page.reload();
    
    // Should still be logged in
    await expect(page).not.toHaveURL(/.*\/login/);
    await expect(page.locator('text=Dashboard, text=Accounts, text=Balance')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Try to submit empty form
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    
    // Check for validation messages
    const usernameInput = page.locator('input[name="username"], input[type="text"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    
    await expect(usernameInput).toHaveAttribute('required', '');
    await expect(passwordInput).toHaveAttribute('required', '');
  });

  test('should handle password visibility toggle', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"], input[type="password"]');
    const toggleButton = page.locator('button:near(input[type="password"]), [data-testid="toggle-password"]');
    
    // Check if password field exists
    await expect(passwordInput).toBeVisible();
    
    // If toggle button exists, test it
    if (await toggleButton.count() > 0) {
      await passwordInput.fill('test123');
      
      // Initially should be password type
      await expect(passwordInput).toHaveAttribute('type', 'password');
      
      // Click toggle
      await toggleButton.click();
      
      // Should change to text type
      await expect(passwordInput).toHaveAttribute('type', 'text');
      
      // Click toggle again
      await toggleButton.click();
      
      // Should change back to password type
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });
});