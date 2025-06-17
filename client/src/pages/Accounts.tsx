import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { University, Settings, CreditCard, PiggyBank, Shield } from "lucide-react";
import { api } from "@/lib/api";
import type { Account } from "@/types";

const DEMO_USER_ID = 1;

export default function Accounts() {
  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: [api.getAccounts(DEMO_USER_ID)],
  });

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <Button variant="ghost" size="sm">
                      <Settings size={16} />
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
                      <span className="text-lg font-semibold">€0.00</span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Last updated: Not available
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      Edit Name
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      Set Role
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
    </>
  );
}
