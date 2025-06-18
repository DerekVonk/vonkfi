import { apiRequest } from "./queryClient";

export const api = {
  // Dashboard
  getDashboard: (userId: number) => `/api/dashboard/${userId}`,
  
  // Import
  importStatement: async (userId: number, file: File) => {
    const formData = new FormData();
    formData.append('camtFile', file);
    
    return apiRequest('POST', `/api/import/${userId}`, formData);
  },
  
  // Accounts
  getAccounts: (userId: number) => `/api/accounts/${userId}`,
  updateAccount: async (accountId: number, updates: any) => {
    return apiRequest('PATCH', `/api/accounts/${accountId}`, updates);
  },
  deleteAccount: async (accountId: number, userId: number) => {
    return apiRequest('DELETE', `/api/accounts/${accountId}?userId=${userId}`);
  },
  
  // Transactions
  getTransactions: (userId: number, limit?: number) => 
    `/api/transactions/${userId}${limit ? `?limit=${limit}` : ''}`,
  updateTransactionCategory: async (transactionId: number, categoryId: number) => {
    return apiRequest('PATCH', `/api/transactions/${transactionId}/category`, { categoryId });
  },
  
  // Categories
  getCategories: () => '/api/categories',
  createCategory: async (categoryData: any) => {
    return apiRequest('POST', '/api/categories', categoryData);
  },
  updateCategory: async (categoryId: number, updates: any) => {
    return apiRequest('PATCH', `/api/categories/${categoryId}`, updates);
  },
  deleteCategory: async (categoryId: number, userId: number) => {
    return apiRequest('DELETE', `/api/categories/${categoryId}?userId=${userId}`);
  },
  
  // Goals
  getGoals: (userId: number) => `/api/goals/${userId}`,
  createGoal: async (goalData: any) => {
    return apiRequest('POST', '/api/goals', goalData);
  },
  updateGoal: async (goalId: number, updates: any) => {
    return apiRequest('PATCH', `/api/goals/${goalId}`, updates);
  },
  
  // Transfer Recommendations
  getTransfers: (userId: number) => `/api/transfers/${userId}`,
  generateTransfers: async (userId: number) => {
    return apiRequest('POST', `/api/transfers/generate/${userId}`);
  },
  updateTransferStatus: async (recommendationId: number, status: string) => {
    return apiRequest('PATCH', `/api/transfers/${recommendationId}`, { status });
  },
  
  // Crypto
  getCrypto: (userId: number) => `/api/crypto/${userId}`,
  createCryptoWallet: async (walletData: any) => {
    return apiRequest('POST', '/api/crypto', walletData);
  },

  // Data Management
  clearUserData: async (userId: number) => {
    return apiRequest('DELETE', `/api/data/${userId}`);
  },
  recalculateDashboard: async (userId: number) => {
    return apiRequest('POST', `/api/recalculate/${userId}`);
  },
};
