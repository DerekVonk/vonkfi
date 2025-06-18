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

      // Try to extract balance information from CAMT if available
      let openingBalance = null;
      let closingBalance = null;
      
      // Check for opening balance
      const openingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'OPBD' || 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'PRCD'
      );
      if (openingBalanceInfo) {
        const amount = parseFloat(openingBalanceInfo.Amt[0]._);
        const indicator = openingBalanceInfo.CdtDbtInd[0];
        openingBalance = indicator === 'DBIT' ? -amount : amount;
      }

      // Check for closing balance  
      const closingBalanceInfo = statement.Bal?.find((bal: any) => 
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLBD' ||
        bal.Tp?.[0]?.CdOrPrtry?.[0]?.Cd?.[0] === 'CLAV'
      );
      if (closingBalanceInfo) {
        const amount = parseFloat(closingBalanceInfo.Amt[0]._);
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
        isActive: true,
      };

      // Extract transactions
      const entries = statement.Ntry || [];
      const transactions: Omit<InsertTransaction, 'accountId'>[] = [];

      for (const entry of entries) {
        const amount = parseFloat(entry.Amt[0]._);
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
          // Try different paths for transaction description
          description = entryDetails.RmtInf?.[0]?.Ustrd?.[0] || 
                       entryDetails.RltdPties?.[0]?.Cdtr?.[0]?.Nm?.[0] ||
                       entryDetails.RltdPties?.[0]?.Dbtr?.[0]?.Nm?.[0] ||
                       'Transaction';

          // Extract counterparty information
          const relatedParties = entryDetails.RltdPties?.[0];
          if (relatedParties) {
            if (creditDebitIndicator === 'CRDT' && relatedParties.Dbtr) {
              counterpartyName = relatedParties.Dbtr[0].Nm?.[0] || '';
              counterpartyIban = relatedParties.DbtrAcct?.[0]?.Id?.[0]?.IBAN?.[0] || '';
            } else if (creditDebitIndicator === 'DBIT' && relatedParties.Cdtr) {
              counterpartyName = relatedParties.Cdtr[0].Nm?.[0] || '';
              counterpartyIban = relatedParties.CdtrAcct?.[0]?.Id?.[0]?.IBAN?.[0] || '';
            }
          }

          reference = entryDetails.Refs?.[0]?.EndToEndId?.[0] || '';
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
