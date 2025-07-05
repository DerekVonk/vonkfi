// Expected data from the CAMT.053 XML file: 50430009_251925218_020125000000_1750248257863.xml
export const expectedCamtData = {
  account: {
    iban: 'GB12ABCD12345678901234',
    bic: 'ABNANL2A',
    currency: 'EUR',
    openingBalance: 1000.00, // OPBD balance
    closingBalance: 850.50, // CLBD balance
    statementDate: '2025-01-15'
  },
  transactions: [
    {
      amount: -50.00,
      date: '2025-01-10T00:00:00.000Z',
      type: 'debit',
      description: 'Payment to Test Merchant',
      counterpartyName: 'Test Merchant',
      counterpartyIban: 'NL58ABNA0529548685',
      reference: 'NOTREF'
    },
    {
      amount: -99.50,
      date: '2025-01-12T00:00:00.000Z',
      type: 'debit',
      description: 'Payment to Another Merchant',
      counterpartyName: 'Another Merchant',
      counterpartyIban: 'NL58ABNA0529548686',
      reference: 'NOTREF'
    }
  ],
  expectedTotals: {
    totalTransactions: 2,
    totalDebits: 149.50,
    totalCredits: 0,
    netChange: -149.50, // 1000.00 - 850.50 = 149.50
    applePayTransactions: 0,
    idealTransactions: 2
  }
};