import { describe, it, expect, beforeAll } from 'vitest';

// Flag to track if server is available
let serverAvailable = false;

// Check if server is available before running tests
beforeAll(async () => {
  try {
    const response = await fetch('http://localhost:5000/api/health', { 
      method: 'GET',
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    serverAvailable = response.ok;
    console.log('Server availability check:', serverAvailable ? 'Available' : 'Not available');
  } catch (error) {
    console.log('Server not available, skipping integration tests');
    serverAvailable = false;
  }
});

describe('Transfer Recommendations Verification', () => {
  // Helper function to conditionally skip tests
  const itIfServer = serverAvailable ? it : it.skip;

  itIfServer('should verify transfer generation is working', async () => {
    // Simple test to verify the API endpoint responds correctly
    const response = await fetch('http://localhost:5000/api/transfers/generate/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('recommendations');
    expect(data).toHaveProperty('allocation');
    expect(data).toHaveProperty('summary');
    expect(Array.isArray(data.recommendations)).toBe(true);

    // Should generate at least one recommendation with current user data
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.summary.numberOfTransfers).toBeGreaterThan(0);
    expect(data.summary.totalRecommended).toBeGreaterThan(0);
  });

  itIfServer('should verify recommendations have correct structure', async () => {
    const response = await fetch('http://localhost:5000/api/transfers/generate/1', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.recommendations.length > 0) {
      const rec = data.recommendations[0];
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('userId');
      expect(rec).toHaveProperty('fromAccountId');
      expect(rec).toHaveProperty('toAccountId');
      expect(rec).toHaveProperty('amount');
      expect(rec).toHaveProperty('purpose');
      expect(rec).toHaveProperty('status');

      // Verify numeric values
      expect(typeof rec.id).toBe('number');
      expect(typeof rec.userId).toBe('number');
      expect(typeof rec.fromAccountId).toBe('number');
      expect(typeof rec.toAccountId).toBe('number');
      expect(typeof rec.amount).toBe('string');
      expect(parseFloat(rec.amount)).toBeGreaterThan(0);
    }
  });
});
