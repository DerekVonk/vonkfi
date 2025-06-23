import { db } from './server/db.ts';
import { transactionHashes } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

async function testHashSchema() {
  try {
    console.log('Testing transaction_hashes schema...');
    
    // Try to query the table using the schema
    const result = await db.select().from(transactionHashes).limit(1);
    console.log('✅ Schema query successful');
    console.log('Results:', result);
    
    // Try to query with specific columns the code expects
    const hashResult = await db.select({
      id: transactionHashes.id,
      hash: transactionHashes.hash,
      userId: transactionHashes.userId,
      transactionId: transactionHashes.transactionId
    }).from(transactionHashes).limit(1);
    
    console.log('✅ Hash column query successful');
    console.log('Hash results:', hashResult);
    
  } catch (error) {
    console.error('❌ Schema test failed:', error.message);
    console.error('This confirms there is a schema mismatch');
  }
  
  process.exit(0);
}

testHashSchema();