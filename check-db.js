import { testConnection, pool } from './server/db.ts';

async function checkDatabase() {
  try {
    console.log('Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.log('Database connection failed');
      return;
    }
    
    const client = await pool.connect();
    
    // List all tables
    console.log('\n=== ALL TABLES ===');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    tablesResult.rows.forEach(row => console.log(row.table_name));
    
    // Check if transaction_hashes table exists and its structure
    console.log('\n=== TRANSACTION_HASHES TABLE ===');
    try {
      const hashTableResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'transaction_hashes' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      
      if (hashTableResult.rows.length > 0) {
        console.log('transaction_hashes table EXISTS with columns:');
        hashTableResult.rows.forEach(row => {
          console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
        });
        
        // Check constraints
        const constraintsResult = await client.query(`
          SELECT constraint_name, constraint_type 
          FROM information_schema.table_constraints 
          WHERE table_name = 'transaction_hashes' 
          AND table_schema = 'public';
        `);
        console.log('Constraints:');
        constraintsResult.rows.forEach(row => {
          console.log(`- ${row.constraint_name}: ${row.constraint_type}`);
        });
        
        // Check row count
        const countResult = await client.query('SELECT COUNT(*) FROM transaction_hashes');
        console.log(`Row count: ${countResult.rows[0].count}`);
        
      } else {
        console.log('transaction_hashes table does NOT exist');
      }
    } catch (error) {
      console.log('Error checking transaction_hashes table:', error.message);
    }
    
    // Check if migrations table exists
    console.log('\n=== MIGRATION STATUS ===');
    try {
      const migrationResult = await client.query(`
        SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;
      `);
      console.log('Recent migrations:');
      migrationResult.rows.forEach(row => {
        console.log(`- ${row.hash}: ${row.created_at}`);
      });
    } catch (error) {
      console.log('No migration table or error:', error.message);
    }
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('Database check error:', error);
    process.exit(1);
  }
}

checkDatabase();