import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CamtParser } from '../server/services/camtParser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { expectedCamtData } from './camt-expected-data';

describe('CAMT.053 Parser Unit Tests', () => {
  let parser: CamtParser;
  let xmlContent: string;

  beforeAll(() => {
    parser = new CamtParser();
    xmlContent = readFileSync(
      join(__dirname, '../attached_assets/50430009_251925218_020125000000_1750248257863.xml'),
      'utf-8'
    );
  });

  it('should parse CAMT.053 XML and extract accurate account information', async () => {
    const result = await parser.parseFile(xmlContent);
    
    expect(result.accounts).toHaveLength(1);
    const account = result.accounts[0];
    
    expect(account.iban).toBe(expectedCamtData.account.iban);
    expect(account.bic).toBe(expectedCamtData.account.bic);
    expect(account.currency).toBe(expectedCamtData.account.currency);
    expect(parseFloat(account.balance)).toBe(expectedCamtData.account.closingBalance);
  });

  it('should parse all transactions with correct amounts and types', async () => {
    const result = await parser.parseFile(xmlContent);
    
    expect(result.transactions).toHaveLength(expectedCamtData.expectedTotals.totalTransactions);
    
    // Verify total debits match expected
    const totalDebits = result.transactions
      .filter(t => parseFloat(t.amount) < 0) // Check for negative amounts (debits)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    
    expect(totalDebits).toBeCloseTo(expectedCamtData.expectedTotals.totalDebits, 2);
  });

  it('should extract merchant names correctly from Apple Pay transactions', async () => {
    const result = await parser.parseFile(xmlContent);
    
    const applePayTransactions = result.transactions.filter(t => 
      t.description.includes('Apple Pay')
    );
    
    expect(applePayTransactions).toHaveLength(expectedCamtData.expectedTotals.applePayTransactions);
    
    // Check specific merchant extractions
    const cellyShopTx = applePayTransactions.find(t => 
      t.merchant?.includes('Celly Shop')
    );
    expect(cellyShopTx).toBeDefined();
    expect(parseFloat(cellyShopTx.amount)).toBe(-35.00);
    
    const cafeThijssenTx = applePayTransactions.find(t => 
      t.merchant?.includes('Cafe Thijssen')
    );
    expect(cafeThijssenTx).toBeDefined();
    expect(parseFloat(cafeThijssenTx.amount)).toBe(-40.00);
  });

  it('should parse iDEAL transactions with counterparty information', async () => {
    const result = await parser.parseFile(xmlContent);
    
    const idealTransactions = result.transactions.filter(t => 
      t.counterpartyName && t.counterpartyIban
    );
    
    expect(idealTransactions).toHaveLength(expectedCamtData.expectedTotals.idealTransactions);
    
    // Check NS Reizigers transaction
    const nsTransaction = idealTransactions.find(t => 
      t.counterpartyName === 'NS Reizigers B.V.'
    );
    expect(nsTransaction).toBeDefined();
    expect(nsTransaction.counterpartyIban).toBe('NL56DEUT0265186420');
    expect(parseFloat(nsTransaction.amount)).toBe(-2.50);
    
    // Check bol.com transaction
    const bolTransaction = idealTransactions.find(t => 
      t.counterpartyName === 'bol.com'
    );
    expect(bolTransaction).toBeDefined();
    expect(bolTransaction.counterpartyIban).toBe('NL27INGB0000026500');
    expect(parseFloat(bolTransaction.amount)).toBe(-24.99);
  });

  it('should generate unique statement ID', async () => {
    const result = await parser.parseFile(xmlContent);
    
    expect(result.statementId).toBeDefined();
    expect(result.statementId).toMatch(/^[a-zA-Z0-9\-\.]+$/);
  });
});