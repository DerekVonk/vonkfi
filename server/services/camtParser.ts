import { parseStringPromise } from 'xml2js';
import { InsertAccount, InsertTransaction } from '@shared/schema';

export interface ParsedStatement {
  accounts: Omit<InsertAccount, 'userId'>[];
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

      const statement = document.BkToCstmrStmt[0].Stmt[0];
      const statementId = statement.Id[0];
      
      // Extract account information
      const accountInfo = statement.Acct[0];
      const iban = accountInfo.Id[0].IBAN[0];
      const accountHolder = accountInfo.Ownr?.[0]?.Nm?.[0] || 'Unknown';
      const bankInfo = accountInfo.Svcr?.[0];
      const bankName = bankInfo?.FinInstnId?.[0]?.Nm?.[0] || 'Unknown Bank';
      const bic = bankInfo?.FinInstnId?.[0]?.BIC?.[0];

      // Extract balance information from CAMT <Bal> tags (per specification)
      let openingBalance = 0;
      let closingBalance = 0;
      
      // Check for opening balance (PRCD = Previous Closing Balance)
      const openingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'OPBD' || 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'PRCD'
      );
      if (openingBalanceInfo) {
        // CAMT amounts are in decimal format (e.g., "000000000001625.95" = €1625.95)
        const amount = parseFloat(openingBalanceInfo.Amt[0]);
        const indicator = openingBalanceInfo.CdtDbtInd[0];
        openingBalance = indicator === 'DBIT' ? -amount : amount;
      }

      // Check for closing balance (CLBD = Closing Balance)
      const closingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLBD' ||
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLAV'
      );
      if (closingBalanceInfo) {
        const amount = parseFloat(closingBalanceInfo.Amt[0]);
        const indicator = closingBalanceInfo.CdtDbtInd[0];
        closingBalance = indicator === 'DBIT' ? -amount : amount;
      }

      const account: Omit<InsertAccount, 'userId'> = {
        iban,
        bic,
        accountHolderName: accountHolder,
        bankName,
        customName: null,
        accountType: 'checking',
        role: null,
        balance: closingBalance.toFixed(2), // Use closing balance from <Bal> tags
        isActive: true,
      };

      // Extract transactions
      const entries = statement.Ntry || [];
      const transactions: Omit<InsertTransaction, 'accountId'>[] = [];

      for (const entry of entries) {
        // Parse transaction amount from <Ntry> elements (per CAMT.053 spec)
        const amount = parseFloat(entry.Amt[0]);
        const currency = entry.Amt[0].$.Ccy || 'EUR';
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

        if (entryDetails) {
          // Extract transaction description from remittance information
          description = entryDetails.RmtInf?.[0]?.Ustrd?.[0] || 
                       entryDetails.AddtlTxInf?.[0] ||
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

  private extractMerchant(description: string, counterpartyName: string): string {
    // Simple merchant extraction logic
    // In a real implementation, this would be more sophisticated
    if (counterpartyName && counterpartyName.trim() !== '') {
      return counterpartyName.trim();
    }
    
    // Extract merchant from description patterns
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

    return description.substring(0, 50).trim();
  }
}
