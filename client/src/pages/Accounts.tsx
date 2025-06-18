import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { University, Settings, CreditCard, PiggyBank, Shield, Edit2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Account } from "@/types";

const DEMO_USER_ID = 1;

export default function Accounts() {
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    customName: "",
    accountType: "",
    role: "",
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: [api.getAccounts(DEMO_USER_ID)],
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ accountId, updates }: { accountId: number; updates: any }) => 
      api.updateAccount(accountId, updates),
    onSuccess: () => {
      toast({
        title: "Account Updated",
        description: "Account details have been updated successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [api.getAccounts(DEMO_USER_ID)] });
      setEditingAccount(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: number) => api.deleteAccount(accountId, DEMO_USER_ID),
    onSuccess: () => {
      toast({
        title: "Account Deleted",
        description: "Account has been deleted successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [api.getAccounts(DEMO_USER_ID)] });
      queryClient.invalidateQueries({ queryKey: [api.getDashboard(DEMO_USER_ID)] });
      setDeletingAccount(null);
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Delete Account",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
      setDeletingAccount(null);
    },
  });

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      customName: account.customName || "",
      accountType: account.accountType || "",
      role: account.role || "",
    });
  };

  const handleSaveAccount = () => {
    if (!editingAccount) return;
    updateAccountMutation.mutate({
      accountId: editingAccount.id,
      updates: formData,
    });
  };

  const getAccountIcon = (accountType: string, role: string | null) => {
    if (role === 'emergency') return Shield;
    if (accountType === 'savings') return PiggyBank;
    return CreditCard;
  };

  const getAccountTypeColor = (accountType: string, role: string | null) => {
    if (role === 'emergency') return 'bg-orange-100 text-orange-800';
    if (role === 'income') return 'bg-green-100 text-green-800';
    if (accountType === 'savings') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const totalBalance = accounts?.reduce((sum, account) => 
    sum + parseFloat(account.balance || '0'), 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-800">Account Management</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Manage your bank accounts, assign roles, and track balances across all your financial institutions
            </p>
          </div>
          
          <Button className="fire-button-primary">
            <Settings className="w-4 h-4 mr-2" />
            Account Settings
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Account Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <University className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-xl font-bold text-neutral-800">{formatCurrency(totalBalance)}</p>
                <p className="text-sm text-neutral-400">Total Balance</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <University className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{accounts?.length || 0}</p>
                <p className="text-sm text-neutral-400">Total Accounts</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CreditCard className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {accounts?.filter(a => a.accountType === 'checking').length || 0}
                </p>
                <p className="text-sm text-neutral-400">Checking</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <PiggyBank className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {accounts?.filter(a => a.accountType === 'savings').length || 0}
                </p>
                <p className="text-sm text-neutral-400">Savings</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Shield className="text-orange-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {accounts?.filter(a => a.role === 'emergency').length || 0}
                </p>
                <p className="text-sm text-neutral-400">Emergency</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Accounts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts?.map((account) => {
            const IconComponent = getAccountIcon(account.accountType, account.role);
            
            return (
              <Card key={account.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <IconComponent className="text-blue-600" size={20} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {account.customName || account.accountHolderName}
                        </CardTitle>
                        <p className="text-sm text-neutral-400">
                          {account.bankName}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditAccount(account)}
                    >
                      <Edit2 size={16} />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-neutral-600">IBAN</span>
                      <span className="text-sm font-mono">...{account.iban.slice(-4)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-neutral-600">Type</span>
                      <Badge className={getAccountTypeColor(account.accountType, account.role)}>
                        {account.role || account.accountType}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-neutral-600">Balance</span>
                      <span className={`text-lg font-semibold ${
                        parseFloat(account.balance || '0') >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(account.balance || '0')}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Calculated from transactions
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleEditAccount(account)}
                    >
                      <Edit2 size={14} className="mr-2" />
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingAccount(account)}
                    >
                      <Trash2 size={14} className="mr-2" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {(!accounts || accounts.length === 0) && (
          <Card className="p-8 text-center">
            <University className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Accounts Found</h3>
            <p className="text-sm text-gray-500 mb-4">
              Import your first bank statement to automatically detect and set up your accounts.
            </p>
            <Button className="fire-button-primary">
              Import Statement
            </Button>
          </Card>
        )}
      </div>

      {/* Edit Account Dialog */}
      <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account Details</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="customName">Custom Name</Label>
              <Input
                id="customName"
                value={formData.customName}
                onChange={(e) => setFormData(prev => ({ ...prev, customName: e.target.value }))}
                placeholder="Enter custom name for this account"
              />
            </div>
            
            <div>
              <Label htmlFor="accountType">Account Type</Label>
              <Select value={formData.accountType} onValueChange={(value) => setFormData(prev => ({ ...prev, accountType: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="role">Account Role</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income Account</SelectItem>
                  <SelectItem value="spending">Spending Account</SelectItem>
                  <SelectItem value="emergency">Emergency Fund</SelectItem>
                  <SelectItem value="goal-specific">Goal-Specific</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setEditingAccount(null)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveAccount}
              disabled={updateAccountMutation.isPending}
              className="flex-1"
            >
              {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation */}
      <AlertDialog open={!!deletingAccount} onOpenChange={() => setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAccount?.customName || deletingAccount?.accountHolderName}"?
              This action cannot be undone and may affect dashboard calculations if the account has transactions or is linked to goals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingAccount && deleteAccountMutation.mutate(deletingAccount.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
