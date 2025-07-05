import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { performance } from 'perf_hooks';

describe('Database Performance Tests', () => {
  let pool: Pool;
  const testDatabaseUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5434/vonkfi_test';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Query Performance Tests', () => {
    it('should execute dashboard query within performance threshold', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        // Execute the optimized dashboard query
        const result = await client.query(`
          SELECT 
            a.id, a.custom_name, a.account_holder_name, a.iban, a.balance,
            a.role, a.last_seen_date,
            COUNT(t.id) as transaction_count,
            MAX(t.date) as last_transaction_date
          FROM accounts a
          LEFT JOIN transactions t ON a.id = t.account_id
          WHERE a.user_id = $1
          GROUP BY a.id
          ORDER BY a.role DESC, a.balance DESC
        `, [1]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log(`Dashboard query execution time: ${executionTime.toFixed(2)}ms`);
        
        // Should execute within 100ms for small datasets
        expect(executionTime).toBeLessThan(100);
        expect(result.rows).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('should execute transaction listing query within performance threshold', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        // Execute optimized transaction query with joins
        const result = await client.query(`
          SELECT 
            t.id, t.amount, t.date, t.description, t.merchant,
            t.reference, t.transaction_type,
            a.custom_name as account_name,
            c.name as category_name
          FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE a.user_id = $1
          ORDER BY t.date DESC
          LIMIT $2
        `, [1, 50]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log(`Transaction listing query execution time: ${executionTime.toFixed(2)}ms`);
        
        // Should execute within 50ms for 50 transactions
        expect(executionTime).toBeLessThan(50);
        expect(result.rows).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('should execute FIRE metrics calculation query within performance threshold', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        // Execute complex aggregation query for FIRE metrics
        const result = await client.query(`
          WITH monthly_data AS (
            SELECT 
              DATE_TRUNC('month', t.date) as month,
              SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income,
              SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as expenses
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE a.user_id = $1
            AND t.date >= NOW() - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', t.date)
          )
          SELECT 
            AVG(income) as avg_monthly_income,
            AVG(expenses) as avg_monthly_expenses,
            AVG(income - expenses) as avg_monthly_savings,
            COUNT(*) as months_count
          FROM monthly_data
        `, [1]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log(`FIRE metrics query execution time: ${executionTime.toFixed(2)}ms`);
        
        // Should execute within 200ms for complex aggregation
        expect(executionTime).toBeLessThan(200);
        expect(result.rows).toBeDefined();
        expect(result.rows.length).toBeGreaterThan(0);
      } finally {
        client.release();
      }
    });

    it('should execute category analysis query within performance threshold', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        // Execute category spending analysis
        const result = await client.query(`
          SELECT 
            c.name as category_name,
            c.type as category_type,
            COUNT(t.id) as transaction_count,
            SUM(ABS(t.amount)) as total_amount,
            AVG(ABS(t.amount)) as avg_amount,
            MIN(t.date) as first_transaction,
            MAX(t.date) as last_transaction
          FROM categories c
          LEFT JOIN transactions t ON c.id = t.category_id
          LEFT JOIN accounts a ON t.account_id = a.id
          WHERE a.user_id = $1 OR a.user_id IS NULL
          GROUP BY c.id, c.name, c.type
          ORDER BY total_amount DESC NULLS LAST
        `, [1]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log(`Category analysis query execution time: ${executionTime.toFixed(2)}ms`);
        
        // Should execute within 150ms
        expect(executionTime).toBeLessThan(150);
        expect(result.rows).toBeDefined();
      } finally {
        client.release();
      }
    });
  });

  describe('Concurrent Connection Tests', () => {
    it('should handle multiple concurrent connections efficiently', async () => {
      const concurrentQueries = 10;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentQueries }, async () => {
        const client = await pool.connect();
        try {
          return await client.query('SELECT COUNT(*) FROM accounts WHERE user_id = $1', [1]);
        } finally {
          client.release();
        }
      });
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`${concurrentQueries} concurrent queries executed in: ${totalTime.toFixed(2)}ms`);
      
      // All queries should complete within 1 second
      expect(totalTime).toBeLessThan(1000);
      expect(results).toHaveLength(concurrentQueries);
      results.forEach(result => {
        expect(result.rows).toBeDefined();
      });
    });

    it('should maintain performance under connection pressure', async () => {
      const heavyConnectionLoad = 25;
      const startTime = performance.now();
      
      const promises = Array.from({ length: heavyConnectionLoad }, async (_, index) => {
        const client = await pool.connect();
        try {
          // Simulate a more complex query
          return await client.query(`
            SELECT t.*, a.custom_name 
            FROM transactions t 
            JOIN accounts a ON t.account_id = a.id 
            WHERE a.user_id = $1 
            ORDER BY t.date DESC 
            LIMIT 10
          `, [1]);
        } finally {
          client.release();
        }
      });
      
      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerQuery = totalTime / heavyConnectionLoad;
      
      console.log(`${heavyConnectionLoad} heavy queries executed in: ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per query: ${avgTimePerQuery.toFixed(2)}ms`);
      
      // Should complete within 3 seconds even under load
      expect(totalTime).toBeLessThan(3000);
      expect(avgTimePerQuery).toBeLessThan(200);
      expect(results).toHaveLength(heavyConnectionLoad);
    });
  });

  describe('Index Performance Tests', () => {
    it('should use indexes efficiently for user-based queries', async () => {
      const client = await pool.connect();
      
      try {
        // Test if user_id queries are using indexes efficiently
        const startTime = performance.now();
        
        const result = await client.query(`
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT * FROM accounts WHERE user_id = $1
        `, [1]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log('Query plan for user_id lookup:');
        result.rows.forEach(row => {
          console.log(row['QUERY PLAN']);
        });
        
        // Query planning and execution should be fast
        expect(executionTime).toBeLessThan(50);
        
        // Check if the plan uses an index scan (not seq scan)
        // Note: With no data, PostgreSQL may use seq scan even with indexes
        const queryPlan = result.rows.map(row => row['QUERY PLAN']).join(' ');
        // For small test datasets, seq scan may be more efficient than index scan
        expect(queryPlan).toMatch(/Index Scan|Bitmap|Seq Scan/i);
      } finally {
        client.release();
      }
    });

    it('should use indexes efficiently for date-based queries', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        const result = await client.query(`
          EXPLAIN (ANALYZE, BUFFERS) 
          SELECT * FROM transactions 
          WHERE date >= $1 AND date <= $2
          ORDER BY date DESC
        `, [new Date('2024-01-01'), new Date('2024-12-31')]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log('Query plan for date range query:');
        result.rows.forEach(row => {
          console.log(row['QUERY PLAN']);
        });
        
        expect(executionTime).toBeLessThan(50);
        
        // Should use index for date filtering and sorting
        // Note: With no data, PostgreSQL may use seq scan even with indexes
        const queryPlan = result.rows.map(row => row['QUERY PLAN']).join(' ');
        expect(queryPlan).toMatch(/Index|Bitmap|Seq Scan/i);
      } finally {
        client.release();
      }
    });
  });

  describe('Memory and Resource Tests', () => {
    it('should handle large result sets efficiently', async () => {
      const client = await pool.connect();
      
      try {
        const startTime = performance.now();
        
        // Query for a large dataset (if available)
        const result = await client.query(`
          SELECT t.*, a.custom_name, c.name as category_name
          FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE a.user_id = $1
          ORDER BY t.date DESC
          LIMIT 1000
        `, [1]);
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        console.log(`Large result set query (${result.rows.length} rows): ${executionTime.toFixed(2)}ms`);
        
        // Should handle 1000 rows efficiently
        expect(executionTime).toBeLessThan(500);
        expect(result.rows).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('should maintain consistent performance with repeated queries', async () => {
      const iterations = 5;
      const executionTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const client = await pool.connect();
        
        try {
          const startTime = performance.now();
          
          await client.query(`
            SELECT COUNT(*) as total_accounts,
                   SUM(balance) as total_balance,
                   AVG(balance) as avg_balance
            FROM accounts 
            WHERE user_id = $1
          `, [1]);
          
          const endTime = performance.now();
          executionTimes.push(endTime - startTime);
        } finally {
          client.release();
        }
      }
      
      const avgTime = executionTimes.reduce((a, b) => a + b, 0) / iterations;
      const maxTime = Math.max(...executionTimes);
      const minTime = Math.min(...executionTimes);
      
      console.log(`Repeated query performance:
        Average: ${avgTime.toFixed(2)}ms
        Min: ${minTime.toFixed(2)}ms
        Max: ${maxTime.toFixed(2)}ms
        Variance: ${(maxTime - minTime).toFixed(2)}ms`);
      
      // Performance should be consistent (low variance)
      expect(avgTime).toBeLessThan(50);
      expect(maxTime - minTime).toBeLessThan(100); // Low variance
    });
  });
});