import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeftRight, CheckCircle, Clock, RotateCcw, AlertCircle, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import VirtualizedList from "@/components/VirtualizedList";
import type { TransferRecommendation, Account } from "@/types";

const DEMO_USER_ID = 1;

const Transfers = memo(function Transfers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transfers, isLoading: transfersLoading } = useQuery<TransferRecommendation[]>({
    queryKey: [api.getTransfers(DEMO_USER_ID)],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: [api.getAccounts(DEMO_USER_ID)],
  });

  const generateTransfersMutation = useMutation({
    mutationFn: async () => {
      const response = await api.generateTransfers(DEMO_USER_ID);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transfer Recommendations Generated",
        description: `Generated ${data?.recommendations?.length || 0} transfer recommendations`,
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

  const getAccountName = useCallback((accountId: number) => {
    const account = accounts?.find(a => a.id === accountId);
    return account?.customName || account?.accountHolderName || 'Unknown Account';
  }, [accounts]);

  const getAccountSuffix = useCallback((accountId: number) => {
    const account = accounts?.find(a => a.id === accountId);
    return account ? `...${account.iban.slice(-4)}` : '';
  }, [accounts]);

  const getStatusColor = useCallback((status: string | null) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      case 'skipped': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const getStatusIcon = useCallback((status: string | null) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'pending': return Clock;
      case 'skipped': return AlertCircle;
      default: return Clock;
    }
  }, []);

  const formatCurrency = useCallback((amount: number | string | null) => {
    const num = typeof amount === 'string' ? parseFloat(amount || '0') : (amount || 0);
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  }, []);

  // Memoize expensive calculations
  const transferStats = useMemo(() => {
    const pendingTransfers = transfers?.filter(t => t.status === 'pending') || [];
    const completedTransfers = transfers?.filter(t => t.status === 'completed') || [];
    const totalValue = transfers?.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0) || 0;
    const completedValue = completedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0);
    const progressPercentage = totalValue > 0 ? (completedValue / totalValue) * 100 : 0;
    
    return {
      pendingTransfers,
      completedTransfers,
      totalValue,
      completedValue,
      progressPercentage
    };
  }, [transfers]);

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
                <p className="text-2xl font-bold text-neutral-800">{transferStats.pendingTransfers.length}</p>
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
                <p className="text-2xl font-bold text-neutral-800">{transferStats.completedTransfers.length}</p>
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
                <p className="text-2xl font-bold text-neutral-800">{formatCurrency(transferStats.totalValue)}</p>
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
                    {transferStats.completedTransfers.length} of {transfers?.length || 0} completed
                  </span>
                </div>
                <Progress value={transferStats.progressPercentage} className="h-3" />
                <div className="flex items-center justify-between text-sm text-neutral-400">
                  <span>Completed: {formatCurrency(transferStats.completedValue)}</span>
                  <span>Remaining: {formatCurrency(transferStats.totalValue - transferStats.completedValue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Transfers */}
        {transferStats.pendingTransfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Pending Transfers</span>
                <Badge className="bg-yellow-100 text-yellow-800">
                  {transferStats.pendingTransfers.length} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transferStats.pendingTransfers.length > 10 ? (
                <VirtualizedList
                  items={transferStats.pendingTransfers}
                  itemHeight={120}
                  height={400}
                  className="space-y-4"
                  renderItem={(transfer) => {
                    const StatusIcon = getStatusIcon(transfer.status);
                    
                    return (
                      <div className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors mr-4">
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
                  }}
                />
              ) : (
                <div className="space-y-4">
                  {transferStats.pendingTransfers.map((transfer) => {
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
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Completed Transfers */}
        {transferStats.completedTransfers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Completed Transfers</span>
                <Badge className="bg-green-100 text-green-800">
                  {transferStats.completedTransfers.length} completed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {transferStats.completedTransfers.slice(0, 5).map((transfer) => {
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
              
              {transferStats.completedTransfers.length > 5 && (
                <p className="text-sm text-neutral-400 text-center pt-2">
                  And {transferStats.completedTransfers.length - 5} more completed transfers...
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
});

export default Transfers;
