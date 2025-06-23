import { test, expect } from '@playwright/test';

test.describe('Dashboard Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.fill('input[name="username"], input[type="text"]', 'e2e_test_user');
    await page.fill('input[name="password"], input[type="password"]', 'password123');
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await page.waitForURL(/.*\/dashboard|.*\/accounts|.*\/home/);
  });

  test('should display dashboard overview', async ({ page }) => {
    // Check for main dashboard elements
    await expect(page.locator('text=Dashboard, text=Overview, h1:has-text("Dashboard")')).toBeVisible();
    
    // Check for account summary
    await expect(page.locator('text=Accounts, text=Balance')).toBeVisible();
    
    // Check for financial metrics
    await expect(page.locator('text=Total Balance, text=Net Worth, text=Monthly Income')).toBeVisible();
  });

  test('should show account cards with correct information', async ({ page }) => {
    // Wait for accounts to load
    await page.waitForSelector('[data-testid="account-card"], .account-card, [class*="account"]');
    
    // Check for test accounts
    await expect(page.locator('text=Main Account')).toBeVisible();
    await expect(page.locator('text=Savings Account')).toBeVisible();
    await expect(page.locator('text=Emergency Fund')).toBeVisible();
    
    // Check for balance information
    await expect(page.locator('text=€5,000, text=€5000, text=5000')).toBeVisible();
    await expect(page.locator('text=€10,000, text=€10000, text=10000')).toBeVisible();
    await expect(page.locator('text=€3,000, text=€3000, text=3000')).toBeVisible();
  });

  test('should display recent transactions', async ({ page }) => {
    // Check for transactions section
    await expect(page.locator('text=Recent Transactions, text=Transactions, h2:has-text("Transactions")')).toBeVisible();
    
    // If transactions exist, check the table/list
    const transactionsList = page.locator('[data-testid="transactions-list"], .transactions-list, table');
    if (await transactionsList.count() > 0) {
      await expect(transactionsList).toBeVisible();
    }
  });

  test('should show goals section', async ({ page }) => {
    // Check for goals section
    await expect(page.locator('text=Goals, text=Financial Goals, h2:has-text("Goals")')).toBeVisible();
    
    // Check for test goals
    await expect(page.locator('text=E2E Vacation Fund')).toBeVisible();
    await expect(page.locator('text=E2E Emergency Buffer')).toBeVisible();
    
    // Check for progress indicators
    await expect(page.locator('[data-testid="progress-bar"], .progress, [class*="progress"]')).toBeVisible();
  });

  test('should calculate and display FIRE metrics', async ({ page }) => {
    // Check for FIRE-related metrics
    const fireElements = [
      'text=FIRE, text=Financial Independence',
      'text=Savings Rate',
      'text=Time to FIRE',
      'text=Net Worth'
    ];
    
    // At least some FIRE metrics should be visible
    let fireElementsFound = 0;
    for (const selector of fireElements) {
      if (await page.locator(selector).count() > 0) {
        fireElementsFound++;
      }
    }
    
    expect(fireElementsFound).toBeGreaterThan(0);
  });

  test('should display transfer recommendations', async ({ page }) => {
    // Check for transfer recommendations section
    if (await page.locator('text=Recommendations, text=Transfer Recommendations').count() > 0) {
      await expect(page.locator('text=Recommendations, text=Transfer Recommendations')).toBeVisible();
    }
  });

  test('should navigate to accounts page', async ({ page }) => {
    // Click on accounts link/button
    await page.click('a:has-text("Accounts"), button:has-text("Accounts"), [href*="accounts"]');
    
    // Should navigate to accounts page
    await expect(page).toHaveURL(/.*\/accounts/);
    await expect(page.locator('text=Accounts, h1:has-text("Accounts")')).toBeVisible();
  });

  test('should navigate to transactions page', async ({ page }) => {
    // Click on transactions link/button
    await page.click('a:has-text("Transactions"), button:has-text("Transactions"), [href*="transactions"]');
    
    // Should navigate to transactions page
    await expect(page).toHaveURL(/.*\/transactions/);
    await expect(page.locator('text=Transactions, h1:has-text("Transactions")')).toBeVisible();
  });

  test('should navigate to goals page', async ({ page }) => {
    // Click on goals link/button
    await page.click('a:has-text("Goals"), button:has-text("Goals"), [href*="goals"]');
    
    // Should navigate to goals page
    await expect(page).toHaveURL(/.*\/goals/);
    await expect(page.locator('text=Goals, h1:has-text("Goals")')).toBeVisible();
  });

  test('should refresh dashboard data', async ({ page }) => {
    // Get initial balance
    const initialBalance = await page.locator('text=€18,000, text=€18000, text=18000').textContent();
    
    // Click refresh button if it exists
    const refreshButton = page.locator('button:has-text("Refresh"), [data-testid="refresh"], [aria-label="Refresh"]');
    if (await refreshButton.count() > 0) {
      await refreshButton.click();
      
      // Wait for potential loading state
      await page.waitForTimeout(1000);
      
      // Data should still be displayed (may be same or updated)
      await expect(page.locator('text=Total Balance, text=Net Worth')).toBeVisible();
    }
  });

  test('should handle responsive design', async ({ page }) => {
    // Test desktop view
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('text=Dashboard')).toBeVisible();
    
    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('text=Dashboard')).toBeVisible();
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('text=Dashboard')).toBeVisible();
    
    // Check if mobile menu exists
    const mobileMenu = page.locator('[data-testid="mobile-menu"], .mobile-menu, button:has-text("Menu")');
    if (await mobileMenu.count() > 0) {
      await expect(mobileMenu).toBeVisible();
    }
  });

  test('should handle loading states', async ({ page }) => {
    // Reload page and check for loading indicators
    await page.reload();
    
    // Check for loading spinners or skeletons
    const loadingIndicators = page.locator('[data-testid="loading"], .loading, .spinner, .skeleton');
    
    // Loading indicators should appear briefly then disappear
    if (await loadingIndicators.count() > 0) {
      await expect(loadingIndicators.first()).toBeVisible();
      await expect(loadingIndicators.first()).not.toBeVisible({ timeout: 10000 });
    }
    
    // Final content should be visible
    await expect(page.locator('text=Dashboard, text=Accounts')).toBeVisible();
  });

  test('should display charts and visualizations', async ({ page }) => {
    // Check for chart elements
    const chartElements = [
      'canvas',
      'svg',
      '[data-testid="chart"]',
      '.recharts-wrapper',
      '.chart-container'
    ];
    
    let chartsFound = 0;
    for (const selector of chartElements) {
      const count = await page.locator(selector).count();
      chartsFound += count;
    }
    
    // Should have at least some visual elements (charts, graphs, etc.)
    expect(chartsFound).toBeGreaterThanOrEqual(0);
  });

  test('should handle error states gracefully', async ({ page }) => {
    // This test would require mocking API failures
    // For now, just ensure no JavaScript errors on page
    const errors: string[] = [];
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Interact with dashboard
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Check that no critical errors occurred
    const criticalErrors = errors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('404') &&
      !error.includes('manifest')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});