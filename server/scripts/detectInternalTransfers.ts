#!/usr/bin/env ts-node

/**
 * Script to detect and mark internal transfers in existing transaction data
 * 
 * This script should be run after importing CAMT data to identify and mark
 * internal transfers that weren't detected during the import process.
 * 
 * Usage:
 *   npm run detect-transfers [userId]
 *   
 * If no userId is provided, it will process all users.
 */

import { db } from '../db';
import { transactions, accounts } from '../../shared/schema';
import { InternalTransferDetector } from '../services/internalTransferDetector';
import { eq, and, isNull, or } from 'drizzle-orm';

async function detectInternalTransfersForUser(userId: number) {
  console.log(`🔍 Processing internal transfers for user ${userId}...`);
  
  try {
    // Get user's accounts
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(
        eq(accounts.userId, userId),
        eq(accounts.isActive, true)
      ));

    if (userAccounts.length === 0) {
      console.log(`   No active accounts found for user ${userId}`);
      return { detected: 0, updated: 0 };
    }

    console.log(`   Found ${userAccounts.length} active accounts`);

    // Get all transactions for this user that haven't been processed yet
    const userTransactions = await db
      .select()
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(
        eq(accounts.userId, userId),
        or(
          eq(transactions.isInternalTransfer, false),
          isNull(transactions.isInternalTransfer)
        )
      ));

    if (userTransactions.length === 0) {
      console.log(`   No unprocessed transactions found for user ${userId}`);
      return { detected: 0, updated: 0 };
    }

    console.log(`   Processing ${userTransactions.length} transactions...`);

    // Initialize the detector
    const detector = new InternalTransferDetector();
    
    // Extract just the transaction data
    const transactionData = userTransactions.map(row => row.transactions);
    
    // Run batch detection
    const detectionResults = await detector.detectBatchTransfers(
      transactionData,
      userAccounts
    );

    console.log(`   Detected ${detectionResults.size} internal transfers`);

    // Update the database with detection results
    let updatedCount = 0;
    for (const [transactionId, result] of Array.from(detectionResults)) {
      try {
        await db
          .update(transactions)
          .set({
            isInternalTransfer: true,
            transferDetectionConfidence: result.confidence,
            matchedTransferId: result.matchedTransactionId || null,
            transferFee: result.transferFee ? result.transferFee.toString() : null
          })
          .where(eq(transactions.id, transactionId));
        
        updatedCount++;
      } catch (error) {
        console.error(`   Error updating transaction ${transactionId}:`, error);
      }
    }

    console.log(`   ✅ Updated ${updatedCount} transactions for user ${userId}`);
    return { detected: detectionResults.size, updated: updatedCount };

  } catch (error) {
    console.error(`   ❌ Error processing user ${userId}:`, error);
    return { detected: 0, updated: 0 };
  }
}

async function getAllUserIds(): Promise<number[]> {
  const result = await db
    .selectDistinct({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.isActive, true));
  
  return result.map(row => row.userId);
}

async function main() {
  console.log('🚀 Starting internal transfer detection...\n');
  
  const args = process.argv.slice(2);
  const targetUserId = args[0] ? parseInt(args[0]) : null;
  
  let userIds: number[];
  
  if (targetUserId) {
    userIds = [targetUserId];
    console.log(`Targeting specific user: ${targetUserId}\n`);
  } else {
    userIds = await getAllUserIds();
    console.log(`Processing all users: ${userIds.length} users found\n`);
  }

  let totalDetected = 0;
  let totalUpdated = 0;

  for (const userId of userIds) {
    const result = await detectInternalTransfersForUser(userId);
    totalDetected += result.detected;
    totalUpdated += result.updated;
  }

  console.log('\n📊 Summary:');
  console.log(`   Total internal transfers detected: ${totalDetected}`);
  console.log(`   Total transactions updated: ${totalUpdated}`);
  console.log('✨ Internal transfer detection complete!');
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { detectInternalTransfersForUser, main as detectAllInternalTransfers };