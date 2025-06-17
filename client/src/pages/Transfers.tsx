import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeftRight, CheckCircle, Clock, RotateCcw, AlertCircle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { TransferRecommendation, Account } from "@/types";

const DEMO_USER_ID = 1;

export default function Transfers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transfers, isLoading: transfersLoading } = useQuery<TransferRecommendation[]>({
    queryKey: [api.getTransfers(DEMO_USER_ID)],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: [api.getAccounts(DEMO_USER_ID)],
  });

  const generateTransfersMutation = useMutation({
    mutationFn: () => api.generateTransfers(DEMO_USER_ID),
    onSuccess: (response) => {
      toast({
        title: "Transfer Recommendations Generated",
        description: `Generated ${response.data?.recommendations?.length || 0} transfer recommendations`,
      });
      queryClient.invalidateQueries({ queryKey: [api.getTransfers(DEMO_USER_ID)] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate transfer recommendations",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      api.updateTransferStatus(id, status),
    onSuccess: () => {
      toast({
        title: "Transfer Updated",
        description: "Transfer status has been updated",
      });
      queryClient.invalidateQueries({ queryKey: [api.getTransfers(DEMO_USER_ID)] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update transfer status",
        variant: "destructive",
      });
    },
  });

  const getAccountName = (accountId: number) => {
    const account = accounts?.find(a => a.id === accountId);
    return account?.customName || account?.accountHolderName || 'Unknown Account';
  };

  const getAccountSuffix = (accountId: number) => {
    const account = accounts?.find(a => a.id === accountId);
    return account ? `...${account.iban.slice(-4)}` : '';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'skipped': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'pending': return Clock;
      case 'skipped': return AlertCircle;
      default: return Clock;
    }
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const pendingTransfers = transfers?.filter(t => t.status === 'pending') || [];
  const completedTransfers = transfers?.filter(t => t.status === 'completed') || [];
  const totalValue = transfers?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0;
  const completedValue = completedTransfers.reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const progressPercentage = totalValue > 0 ? (completedValue / totalValue) * 100 : 0;

  if (transfersLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
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
            <h2 className="text-2xl font-semibold text-neutral-800">Transfer Instructions</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Execute your monthly transfer recommendations to achieve your FIRE goals
            </p>
          </div>
          
          <Button 
            onClick={() => generateTransfersMutation.mutate()}
            disabled={generateTransfersMutation.isPending}
            className="fire-button-primary"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {generateTransfersMutation.isPending ? "Generating..." : "Generate New Recommendations"}
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Transfer Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <ArrowLeftRight className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{transfers?.length || 0}</p>
                <p className="text-sm text-neutral-400">Total Transfers</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="text-yellow-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{pendingTransfers.length}</p>
                <p className="text-sm text-neutral-400">Pending</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{completedTransfers.length}</p>
                <p className="text-sm text-neutral-400">Completed</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{formatCurrency(totalValue)}</p>
                <p className="text-sm text-neutral-400">Total Value</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Progress Overview */}
        {transfers && transfers.length > 0 && (
          <Card className="p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Monthly Transfer Progress</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Overall Progress</span>
                  <span className="font-medium text-neutral-800">
                    {completedTransfers.length} of {transfers.length} completed
                  </span>
                </div>
                <Progress value={progressPercentage} className="h-3" />
                <div className="flex items-center justify-between text-sm text-neutral-400">
                  <span>Completed: {formatCurrency(completedValue)}</span>
                  <span>Remaining: {formatCurrency(totalValue - completedValue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Transfers */}
        {pendingTransfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Pending Transfers</span>
                <Badge className="bg-yellow-100 text-yellow-800">
                  {pendingTransfers.length} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingTransfers.map((transfer) => {
                const StatusIcon = getStatusIcon(transfer.status);
                
                return (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <StatusIcon className="text-blue-600" size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-800">
                          Transfer {formatCurrency(transfer.amount)} from {getAccountName(transfer.fromAccountId)}
                        </p>
                        <p className="text-xs text-neutral-400">
                          to {getAccountName(transfer.toAccountId)} ({getAccountSuffix(transfer.toAccountId)})
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">{transfer.purpose}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(transfer.status)}>
                        {transfer.status}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: transfer.id, status: 'completed' })}
                        disabled={updateStatusMutation.isPending}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        variant="ghost"
                      >
                        Mark Complete
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: transfer.id, status: 'skipped' })}
                        disabled={updateStatusMutation.isPending}
                        className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                        variant="ghost"
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Completed Transfers */}
        {completedTransfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Completed Transfers</span>
                <Badge className="bg-green-100 text-green-800">
                  {completedTransfers.length} completed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {completedTransfers.slice(0, 5).map((transfer) => {
                const StatusIcon = getStatusIcon(transfer.status);
                
                return (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg bg-green-50/50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <StatusIcon className="text-green-600" size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-800">
                          Transfer {formatCurrency(transfer.amount)} from {getAccountName(transfer.fromAccountId)}
                        </p>
                        <p className="text-xs text-neutral-400">
                          to {getAccountName(transfer.toAccountId)} ({getAccountSuffix(transfer.toAccountId)})
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">{transfer.purpose}</p>
                      </div>
                    </div>
                    
                    <Badge className={getStatusColor(transfer.status)}>
                      ✓ {transfer.status}
                    </Badge>
                  </div>
                );
              })}
              
              {completedTransfers.length > 5 && (
                <p className="text-sm text-neutral-400 text-center pt-2">
                  And {completedTransfers.length - 5} more completed transfers...
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {(!transfers || transfers.length === 0) && (
          <Card className="p-8 text-center">
            <ArrowLeftRight className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Transfer Recommendations</h3>
            <p className="text-sm text-gray-500 mb-4">
              Generate transfer recommendations based on your current financial situation and goals.
            </p>
            <Button 
              onClick={() => generateTransfersMutation.mutate()}
              disabled={generateTransfersMutation.isPending}
              className="fire-button-primary"
            >
              Generate Recommendations
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
