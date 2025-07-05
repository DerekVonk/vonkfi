import { parseStringPromise } from 'xml2js';
import { InsertAccount, InsertTransaction } from '@shared/schema';

export interface ParsedStatement {
  accounts: (Omit<InsertAccount, 'userId'> & { currency: string })[];
  transactions: Omit<InsertTransaction, 'accountId'>[];
  statementId: string;
}

export class CamtParser {
  async parseFile(xmlContent: string): Promise<ParsedStatement> {
    try {
      const result = await parseStringPromise(xmlContent);
      const document = result.Document;
      
      if (!document || !document.BkToCstmrStmt) {
        throw new Error('Invalid CAMT.053 format: Missing required elements');
      }

      if (!document.BkToCstmrStmt[0] || !document.BkToCstmrStmt[0].Stmt || !document.BkToCstmrStmt[0].Stmt[0]) {
        throw new Error('Invalid CAMT.053 format: Missing required statement elements');
      }

      const statement = document.BkToCstmrStmt[0].Stmt[0];
      
      if (!statement.Id || !statement.Id[0]) {
        throw new Error('Invalid CAMT.053 format: Missing statement ID');
      }
      
      const statementId = statement.Id[0];
      
      // Extract account information
      if (!statement.Acct || !statement.Acct[0]) {
        throw new Error('Invalid CAMT.053 format: Missing account information');
      }
      
      const accountInfo = statement.Acct[0];
      
      if (!accountInfo.Id || !accountInfo.Id[0] || !accountInfo.Id[0].IBAN || !accountInfo.Id[0].IBAN[0]) {
        throw new Error('Invalid CAMT.053 format: Missing account IBAN');
      }
      
      const iban = accountInfo.Id[0].IBAN[0];
      const accountHolder = accountInfo.Ownr?.[0]?.Nm?.[0] || 'Unknown';
      const bankInfo = accountInfo.Svcr?.[0];
      
      // Try to extract bank name from multiple sources
      let bankName = bankInfo?.FinInstnId?.[0]?.Nm?.[0];
      
      // If no bank name found in the service provider, try alternative locations
      if (!bankName) {
        // Check if there's bank information in the statement header
        bankName = document.BkToCstmrStmt?.[0]?.GrpHdr?.[0]?.MsgRcpt?.[0]?.Nm?.[0] ||
                  document.BkToCstmrStmt?.[0]?.GrpHdr?.[0]?.InstgAgt?.[0]?.FinInstnId?.[0]?.Nm?.[0];
      }
      
      // Standardize bank names using BIC mapping if available
      const bic = bankInfo?.FinInstnId?.[0]?.BIC?.[0];
      const bicToBankMap: Record<string, string> = {
        'ABNANL2A': 'ABN AMRO Bank',
        'INGBNL2A': 'ING Bank',
        'RABONL2U': 'Rabobank',
        'DEUTNL2N': 'Deutsche Bank Nederland',
        'SNSBNL2A': 'SNS Bank',
        'ASNBNL21': 'ASN Bank',
        'BUNQNL2A': 'bunq',
        'REVOLUT21': 'Revolut',
        'TRIONL2U': 'Triodos Bank',
        'FBHLLUX': 'Banque et Caisse d\'Epargne de l\'Etat',
        'BCMCLUX': 'Banque et Caisse d\'Epargne de l\'Etat',
      };
      
      // Prefer standardized bank names from BIC mapping over XML bank names
      if (bic && bicToBankMap[bic]) {
        bankName = bicToBankMap[bic];
      } else if (!bankName && bic) {
        bankName = bic;
      }
      
      // Final fallback
      bankName = bankName || 'Unknown Bank';

      // Extract balance information from CAMT <Bal> tags (per specification)
      let openingBalance = 0;
      let closingBalance = 0;
      let accountCurrency = 'EUR'; // Default currency
      
      // Check for opening balance (PRCD = Previous Closing Balance)
      const openingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'OPBD' || 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'PRCD'
      );
      if (openingBalanceInfo) {
        // Handle CAMT balance amount parsing (similar to transaction amounts)
        let amount: number;
        if (typeof openingBalanceInfo.Amt[0] === 'object' && openingBalanceInfo.Amt[0]._) {
          amount = parseFloat(openingBalanceInfo.Amt[0]._);
          accountCurrency = openingBalanceInfo.Amt[0].$.Ccy || 'EUR';
        } else {
          amount = parseFloat(openingBalanceInfo.Amt[0]);
        }
        const indicator = openingBalanceInfo.CdtDbtInd[0];
        openingBalance = indicator === 'DBIT' ? -amount : amount;
      }

      // Check for closing balance (CLBD = Closing Balance)
      const closingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLBD' ||
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLAV'
      );
      if (closingBalanceInfo) {
        let amount: number;
        
        // Handle CAMT balance amount format (with Ccy attribute)
        if (typeof closingBalanceInfo.Amt[0] === 'object') {
          if (closingBalanceInfo.Amt[0]._) {
            // Format: { _: "000000000000561.54", $: { Ccy: "EUR" } }
            amount = parseFloat(closingBalanceInfo.Amt[0]._);
            accountCurrency = closingBalanceInfo.Amt[0].$.Ccy || 'EUR';
          } else if (closingBalanceInfo.Amt[0].$) {
            // Direct object with currency attribute
            amount = parseFloat(closingBalanceInfo.Amt[0]);
            accountCurrency = closingBalanceInfo.Amt[0].$.Ccy || 'EUR';
          } else {
            amount = parseFloat(String(closingBalanceInfo.Amt[0]));
          }
        } else {
          // Direct string format: "000000000000561.54"
          amount = parseFloat(closingBalanceInfo.Amt[0]);
        }
        const indicator = closingBalanceInfo.CdtDbtInd[0];
        closingBalance = indicator === 'DBIT' ? -amount : amount;
      }

      const account: Omit<InsertAccount, 'userId'> & { currency: string } = {
        iban,
        bic,
        accountHolderName: accountHolder,
        bankName,
        customName: null,
        accountType: 'checking',
        role: null,
        balance: closingBalance.toFixed(2), // Use closing balance from <Bal> tags
        currency: accountCurrency,                 
        isActive: true,
      };

      // Extract transactions
      const entries = statement.Ntry || [];
      const transactions: Omit<InsertTransaction, 'accountId'>[] = [];

      for (const entry of entries) {
        // Parse transaction amount from <Ntry> elements (per CAMT.053 spec)
        // Handle both object and direct value formats for CAMT amounts
        let amount: number;
        let currency: string;
        
        if (typeof entry.Amt[0] === 'object' && entry.Amt[0]._) {
          // XML parser format: { _: "value", $: { Ccy: "EUR" } }
          amount = parseFloat(entry.Amt[0]._);
          currency = entry.Amt[0].$.Ccy || 'EUR';
        } else if (typeof entry.Amt[0] === 'string') {
          // Direct string format
          amount = parseFloat(entry.Amt[0]);
          currency = accountCurrency; // Use account currency as fallback
        } else {
          // Fallback - extract from nested structure
          amount = parseFloat(entry.Amt[0]);
          currency = accountCurrency; // Use account currency as fallback
        }
        
        const creditDebitIndicator = entry.CdtDbtInd[0];
        const finalAmount = creditDebitIndicator === 'DBIT' ? -amount : amount;
        
        const bookingDate = new Date(entry.BookgDt[0].Dt[0]);
        const valueDate = new Date(entry.ValDt?.[0]?.Dt?.[0] || entry.BookgDt[0].Dt[0]);
        
        // Extract transaction details
        const entryDetails = entry.NtryDtls?.[0]?.TxDtls?.[0];
        let description = 'Transaction';
        let counterpartyName = '';
        let counterpartyIban = '';
        let reference = '';

        // First check for structured entry details (iDEAL transactions have priority)
        if (entryDetails) {
          // Extract transaction description from remittance information
          description = entryDetails.RmtInf?.[0]?.Ustrd?.[0] || 
                       entryDetails.AddtlTxInf?.[0] ||
                       entry.AddtlNtryInf?.[0] ||
                       'Transaction';

          // Extract counterparty information based on transaction direction (per CAMT.053 spec)
          const relatedParties = entryDetails.RltdPties?.[0];
          if (relatedParties) {
            if (creditDebitIndicator === 'CRDT' && relatedParties.Dbtr) {
              // Credit transaction: money received from debtor
              counterpartyName = relatedParties.Dbtr[0].Nm?.[0] || '';
              counterpartyIban = relatedParties.DbtrAcct?.[0]?.Id?.[0]?.IBAN?.[0] || '';
            } else if (creditDebitIndicator === 'DBIT' && relatedParties.Cdtr) {
              // Debit transaction: money sent to creditor
              counterpartyName = relatedParties.Cdtr[0].Nm?.[0] || '';
              counterpartyIban = relatedParties.CdtrAcct?.[0]?.Id?.[0]?.IBAN?.[0] || '';
            }
          }

          // Extract payment reference from structured remittance info
          reference = entryDetails.RmtInf?.[0]?.Strd?.[0]?.CdtrRefInf?.[0]?.Ref?.[0] ||
                     entryDetails.Refs?.[0]?.EndToEndId?.[0] ||
                     entry.AcctSvcrRef?.[0] || '';
        }
        // Fallback for Apple Pay transactions - check for AddtlNtryInf
        else if (entry.AddtlNtryInf?.[0]) {
          description = entry.AddtlNtryInf[0];
          reference = entry.AcctSvcrRef?.[0] || '';
        }
        // Final fallback to basic reference
        else {
          reference = entry.AcctSvcrRef?.[0] || '';
        }

        const transaction: Omit<InsertTransaction, 'accountId'> = {
          date: valueDate,
          amount: finalAmount.toString(),
          currency,
          description,
          merchant: this.extractMerchant(description, counterpartyName),
          categoryId: null,
          isIncome: finalAmount > 0,
          counterpartyIban: counterpartyIban || null,
          counterpartyName: counterpartyName || null,
          reference: reference || null,
          statementId,
        };

        transactions.push(transaction);
      }

      return {
        accounts: [account],
        transactions,
        statementId,
      };
    } catch (error) {
      throw new Error(`Failed to parse CAMT.053 file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractMerchant(description: string, counterpartyName: string): string | null {
    // If we have a counterparty name, use it
    if (counterpartyName && counterpartyName.trim() !== '') {
      return counterpartyName.trim();
    }
    
    // Apple Pay pattern: "BEA, Apple Pay                  CCV*Celly Shop,PAS353           NR:CT637285, 02.01.25/16:31     AMSTERDAM"
    const applePayMatch = description.match(/BEA,\s*Apple\s*Pay\s+CCV\*([^,]+)/i);
    if (applePayMatch) {
      return applePayMatch[1].trim();
    }

    // Apple Pay alternative pattern: "BEA, Apple Pay                  Cafe Thijssen,PAS342"
    const applePayMatch2 = description.match(/BEA,\s*Apple\s*Pay\s+([^,]+),PAS/i);
    if (applePayMatch2) {
      return applePayMatch2[1].trim();
    }

    // SumUp pattern: "SumUp  *MKD Vintage BV"
    const sumUpMatch = description.match(/SumUp\s+\*([^,]+)/i);
    if (sumUpMatch) {
      return `SumUp ${sumUpMatch[1].trim()}`;
    }
    
    // Extract merchant from other description patterns
    const merchantPatterns = [
      /CARD\s+\d+\s+(.+?)(?:\s+\d{2}\/\d{2})?$/i,
      /POS\s+(.+?)(?:\s+\d{2}\/\d{2})?$/i,
      /(.+?)\s+\d{2}\/\d{2}\/\d{4}$/i,
    ];

    for (const pattern of merchantPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // If no merchant could be extracted, return null instead of a truncated description
    return null;
  }
}
