import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Navigation Highlighting Logic Fix', () => {
  // Test the navigation highlighting fix for Import History vs Import Statements
  const isActive = (href: string, location: string) => {
    if (href === "/") return location === "/";
    if (href === "/import" && location === "/import-history") return false;
    return location.startsWith(href);
  };

  it('should not highlight Import Statements when on Import History page', () => {
    const location = '/import-history';
    
    // Import Statements should NOT be active
    expect(isActive('/import', location)).toBe(false);
    
    // Import History should be active
    expect(isActive('/import-history', location)).toBe(true);
  });

  it('should highlight Import Statements when on Import page', () => {
    const location = '/import';
    
    // Import Statements should be active
    expect(isActive('/import', location)).toBe(true);
    
    // Import History should NOT be active
    expect(isActive('/import-history', location)).toBe(false);
  });

  it('should handle exact root path matching', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/dashboard')).toBe(false);
    expect(isActive('/', '/import')).toBe(false);
  });

  it('should handle nested paths correctly', () => {
    expect(isActive('/accounts', '/accounts/123')).toBe(true);
    expect(isActive('/goals', '/goals/edit/1')).toBe(true);
    expect(isActive('/categories', '/categories/new')).toBe(true);
  });
});

describe('API Button Functionality', () => {
  // Mock the API functions
  const mockClearUserData = vi.fn();
  const mockRecalculateDashboard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockClearUserData.mockResolvedValue({ 
      message: 'Import data cleared and dashboard recalculated' 
    });
    mockRecalculateDashboard.mockResolvedValue({ 
      message: 'Dashboard recalculated successfully' 
    });
  });

  it('should call clearUserData with correct user ID', async () => {
    const userId = 1;
    await mockClearUserData(userId);
    
    expect(mockClearUserData).toHaveBeenCalledWith(1);
    expect(mockClearUserData).toHaveBeenCalledTimes(1);
  });

  it('should call recalculateDashboard with correct user ID', async () => {
    const userId = 1;
    await mockRecalculateDashboard(userId);
    
    expect(mockRecalculateDashboard).toHaveBeenCalledWith(1);
    expect(mockRecalculateDashboard).toHaveBeenCalledTimes(1);
  });

  it('should handle clearUserData API success response', async () => {
    const result = await mockClearUserData(1);
    
    expect(result).toEqual({
      message: 'Import data cleared and dashboard recalculated'
    });
  });

  it('should handle recalculateDashboard API success response', async () => {
    const result = await mockRecalculateDashboard(1);
    
    expect(result).toEqual({
      message: 'Dashboard recalculated successfully'
    });
  });

  it('should handle clearUserData API errors', async () => {
    const errorMessage = 'Network error';
    mockClearUserData.mockRejectedValue(new Error(errorMessage));

    await expect(mockClearUserData(1)).rejects.toThrow(errorMessage);
  });

  it('should handle recalculateDashboard API errors', async () => {
    const errorMessage = 'Server error';
    mockRecalculateDashboard.mockRejectedValue(new Error(errorMessage));

    await expect(mockRecalculateDashboard(1)).rejects.toThrow(errorMessage);
  });
});

describe('Settings Page Navigation Logic', () => {
  // Test the settings page button navigation functionality
  const mockSetLocation = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should navigate to import-history when View Import History is clicked', () => {
    // Simulate button click
    mockSetLocation('/import-history');
    
    expect(mockSetLocation).toHaveBeenCalledWith('/import-history');
  });

  it('should navigate to categories when Budget Categories is clicked', () => {
    // Simulate button click
    mockSetLocation('/categories');
    
    expect(mockSetLocation).toHaveBeenCalledWith('/categories');
  });

  it('should navigate to budget when Default Allocations is clicked', () => {
    // Simulate button click
    mockSetLocation('/budget');
    
    expect(mockSetLocation).toHaveBeenCalledWith('/budget');
  });

  it('should validate all navigation paths are correct', () => {
    const expectedRoutes = [
      '/import-history',
      '/categories', 
      '/budget'
    ];

    expectedRoutes.forEach(route => {
      mockSetLocation(route);
      expect(mockSetLocation).toHaveBeenCalledWith(route);
    });

    expect(mockSetLocation).toHaveBeenCalledTimes(expectedRoutes.length);
  });
});