// Expected data from the CAMT.053 XML file: 50430009_251925218_020125000000_1750248257863.xml
export const expectedCamtData = {
  account: {
    iban: 'NL57ABNA0251925218',
    bic: 'ABNANL2A',
    currency: 'EUR',
    openingBalance: 749.58, // PRCD balance
    closingBalance: 561.54, // CLBD balance
    statementDate: '2025-01-02'
  },
  transactions: [
    {
      amount: -35.00,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  CCV*Celly Shop,PAS353           NR:CT637285, 02.01.25/16:31     AMSTERDAM',
      merchant: 'Celly Shop',
      reference: '0102163142208897'
    },
    {
      amount: -10.20,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  CCV*DE SLEUTELSPECIALI,PAS342   NR:CT145270, 02.01.25/15:51     AMSTERDAM',
      merchant: 'DE SLEUTELSPECIALI',
      reference: '0102155145288055'
    },
    {
      amount: -13.50,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  CCV*MECHANISCH SPEELGO,PAS342   NR:CT682676, 02.01.25/15:18     AMSTERDAM',
      merchant: 'MECHANISCH SPEELGO',
      reference: '0102151849285956'
    },
    {
      amount: -40.00,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  Cafe Thijssen,PAS342            NR:03597983, 02.01.25/13:57     Amsterdam',
      merchant: 'Cafe Thijssen',
      reference: '0102135754096612'
    },
    {
      amount: -12.00,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  Petit gateau,PAS342             NR:24213054, 02.01.25/13:18     Amsterdam',
      merchant: 'Petit gateau',
      reference: '0102131805388886'
    },
    {
      amount: -49.85,
      date: '2025-01-02',
      type: 'debit',
      description: 'BEA, Apple Pay                  SumUp  *MKD Vintage BV,PAS342   NR:MCUH3E23, 02.01.25/13:07     Hellevoetslui',
      merchant: 'SumUp MKD Vintage BV',
      reference: '0102130710371469'
    },
    {
      amount: -2.50,
      date: '2025-01-02',
      type: 'debit',
      counterpartyName: 'NS Reizigers B.V.',
      counterpartyIban: 'NL56DEUT0265186420',
      description: 'E517525830 8030465478916939 NS e-Tickets. Order. E517525830',
      reference: 'ECS00000F6BE0B20'
    },
    {
      amount: -24.99,
      date: '2025-01-02',
      type: 'debit',
      counterpartyName: 'bol.com',
      counterpartyIban: 'NL27INGB0000026500',
      description: '1499360180 7051135787888100 bol.com BUN1801236744120',
      reference: 'ECS00000F6979FA0'
    }
  ],
  expectedTotals: {
    totalTransactions: 8,
    totalDebits: 188.04,
    totalCredits: 0,
    netChange: -188.04, // 749.58 - 561.54 = 188.04
    applePayTransactions: 6,
    idealTransactions: 2
  }
};