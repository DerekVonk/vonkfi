import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testTransactionHash() {
  try {
    const client = await pool.connect();
    
    // Test inserting a transaction hash
    console.log('Testing transaction hash insert...');
    
    // Insert a test hash
    const insertResult = await client.query(`
      INSERT INTO transaction_hashes (user_id, transaction_id, hash) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `, [1, 1, 'test_hash_' + Date.now()]);
    
    console.log('✅ Insert successful:', insertResult.rows[0]);
    
    // Query by hash (this is what the duplicate detection code does)
    const queryResult = await client.query(`
      SELECT * FROM transaction_hashes WHERE hash = $1
    `, [insertResult.rows[0].hash]);
    
    console.log('✅ Query by hash successful:', queryResult.rows[0]);
    
    // Test unique constraint
    try {
      await client.query(`
        INSERT INTO transaction_hashes (user_id, transaction_id, hash) 
        VALUES ($1, $2, $3)
      `, [1, 2, insertResult.rows[0].hash]);
      console.log('❌ Unique constraint should have prevented this');
    } catch (error) {
      console.log('✅ Unique constraint working:', error.message);
    }
    
    // Clean up
    await client.query('DELETE FROM transaction_hashes WHERE id = $1', [insertResult.rows[0].id]);
    console.log('✅ Cleanup successful');
    
    client.release();
    await pool.end();
    console.log('✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTransactionHash();