import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import express from 'express';
import { registerRoutes } from '../server/routes';
import { storage } from '../server/storage';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('CAMT Import with Internal Transfer Detection Integration', () => {
  let app: express.Application;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    // Skip database-dependent tests if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping database-dependent import integration test - no test database available');
      return;
    }

    app = express();
    app.use(express.json());
    server = await registerRoutes(app);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('should automatically detect and mark internal transfers during CAMT import', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    // Clear existing data first
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Get initial internal transfer count (should be 0)
    const initialTransactions = await storage.getTransactionsByUserId(userId);
    const initialInternalTransfers = initialTransactions.filter(t => t.isInternalTransfer);
    expect(initialInternalTransfers).toHaveLength(0);

    // First, create additional user accounts that will match the IBAN patterns in our test CAMT file
    // This ensures the IBAN-based detection will work
    await request(app)
      .post('/api/accounts')
      .send({
        userId,
        iban: 'GB12ABCD12345678901235',
        accountHolderName: 'Test User Savings',
        bankName: 'ABN AMRO Bank N.V.',
        customName: 'Savings Account'
      });

    await request(app)
      .post('/api/accounts')
      .send({
        userId,
        iban: 'GB12ABCD12345678901236',
        accountHolderName: 'Test User Checking',
        bankName: 'ABN AMRO Bank N.V.',
        customName: 'Checking Account'
      });

    // Read the test CAMT.053 XML file with internal transfer patterns
    const xmlContent = readFileSync(
      join(__dirname, '../attached_assets/test-internal-transfers.xml'),
      'utf-8'
    );

    // Import the CAMT file
    const importResponse = await request(app)
      .post(`/api/import/${userId}`)
      .attach('camtFile', Buffer.from(xmlContent), 'test-statement.xml')
      .expect(200);

    expect(importResponse.body.message).toContain('imported successfully');
    console.log(`📊 Import result: ${importResponse.body.data.newTransactions.length} transactions imported`);

    // Wait a moment for async processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get transactions after import and check for internal transfers
    const allTransactions = await storage.getTransactionsByUserId(userId);
    const internalTransfers = allTransactions.filter(t => t.isInternalTransfer);
    
    console.log(`🔍 Found ${internalTransfers.length} internal transfers out of ${allTransactions.length} total transactions`);
    
    // Verify that internal transfers were detected during import
    expect(internalTransfers.length).toBeGreaterThan(0);
    
    // Check that we have different confidence levels
    const highConfidence = internalTransfers.filter(t => t.transferDetectionConfidence === 'high');
    const mediumConfidence = internalTransfers.filter(t => t.transferDetectionConfidence === 'medium');
    
    console.log(`📈 Detection breakdown: ${highConfidence.length} high confidence, ${mediumConfidence.length} medium confidence`);
    
    // Verify confidence levels are assigned
    expect(highConfidence.length + mediumConfidence.length).toBe(internalTransfers.length);
    
    // Get user accounts to verify IBAN matching detection
    const userAccounts = await storage.getAccountsByUserId(userId);
    const userIbans = userAccounts.map(a => a.iban);
    
    // Check that high confidence transfers include IBAN matches
    const ibanMatches = internalTransfers.filter(t => 
      t.transferDetectionConfidence === 'high' && 
      t.counterpartyIban && 
      userIbans.includes(t.counterpartyIban)
    );
    
    console.log(`💳 IBAN matches: ${ibanMatches.length} transfers between user accounts`);
    expect(ibanMatches.length).toBeGreaterThan(0);
    
    // Verify that FIRE calculations now properly exclude internal transfers
    const dashboardResponse = await request(app)
      .get(`/api/dashboard/${userId}`)
      .expect(200);

    const { fireMetrics } = dashboardResponse.body;
    expect(fireMetrics).toBeDefined();
    expect(fireMetrics.monthlyExpenses).toBeGreaterThan(0);
    
    console.log(`💰 FIRE metrics after import: €${fireMetrics.monthlyExpenses} expenses, ${(fireMetrics.savingsRate * 100).toFixed(1)}% savings rate`);
    
    // Log some example internal transfers for verification
    const exampleTransfers = internalTransfers.slice(0, 3);
    console.log('📋 Example detected internal transfers:');
    exampleTransfers.forEach((t, i) => {
      console.log(`   ${i + 1}. €${t.amount} - ${t.description || 'No description'} (${t.transferDetectionConfidence} confidence)`);
      if (t.counterpartyIban) {
        console.log(`      Counterparty IBAN: ${t.counterpartyIban}`);
      }
    });
  });

  it('should handle CAMT import with no internal transfers correctly', async () => {
    // Skip if no database connection
    if (process.env.SKIP_DB_TESTS === 'true') {
      console.log('Skipping test - no database connection');
      return;
    }

    const userId = 1;
    
    // Clear existing data
    await request(app)
      .delete(`/api/data/${userId}`)
      .expect(200);

    // Create a minimal CAMT XML with no internal transfers
    const minimalCamtXml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>TEST001</MsgId>
      <CreDtTm>2025-01-01T00:00:00</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>TEST-STMT-001</Id>
      <Acct>
        <Id>
          <IBAN>NL99TEST0000000001</IBAN>
        </Id>
        <Nm>Test Account</Nm>
        <Ccy>EUR</Ccy>
      </Acct>
      <Bal>
        <Tp>
          <CdOrPrtry>
            <Cd>CLBD</Cd>
          </CdOrPrtry>
        </Tp>
        <Amt Ccy="EUR">100.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">50.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt>
          <Dt>2025-01-01</Dt>
        </BookgDt>
        <ValDt>
          <Dt>2025-01-01</Dt>
        </ValDt>
        <NtryDtls>
          <TxDtls>
            <RmtInf>
              <Ustrd>External payment</Ustrd>
            </RmtInf>
            <RltdPties>
              <CdtrAcct>
                <Id>
                  <IBAN>NL99EXTERNAL000001</IBAN>
                </Id>
              </CdtrAcct>
              <Cdtr>
                <Nm>External Merchant</Nm>
              </Cdtr>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

    // Import the CAMT file
    const importResponse = await request(app)
      .post(`/api/import/${userId}`)
      .attach('camtFile', Buffer.from(minimalCamtXml), 'test-external-only.xml')
      .expect(200);

    expect(importResponse.body.message).toContain('imported successfully');

    // Verify no internal transfers were detected
    const allTransactions = await storage.getTransactionsByUserId(userId);
    const internalTransfers = allTransactions.filter(t => t.isInternalTransfer);
    
    expect(internalTransfers).toHaveLength(0);
    console.log('✅ Correctly detected no internal transfers in external-only CAMT file');
  });
});