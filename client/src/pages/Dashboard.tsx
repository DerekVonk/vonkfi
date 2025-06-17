import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUp, ArrowDown, PiggyBank, Shield, Flame, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types";
import ImportModal from "@/components/ImportModal";
import IncomeVolatilityChart from "@/components/charts/IncomeVolatilityChart";

const DEMO_USER_ID = 1;

export default function Dashboard() {
  const [showImportModal, setShowImportModal] = useState(false);
  
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: [api.getDashboard(DEMO_USER_ID)],
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-gray-200 rounded-xl"></div>
            <div className="lg:col-span-2 h-64 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const formatPercentage = (rate: number) => {
    return `${Math.round(rate * 100)}%`;
  };

  const getBufferStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return 'text-green-600';
      case 'above': return 'text-blue-600';
      case 'below': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getGoalStatusBadge = (goal: any) => {
    const current = parseFloat(goal.currentAmount);
    const target = parseFloat(goal.targetAmount);
    const progress = current / target;
    
    if (progress >= 1) return <Badge className="bg-green-100 text-green-800">Complete</Badge>;
    if (progress >= 0.8) return <Badge className="bg-blue-100 text-blue-800">Near Complete</Badge>;
    if (progress >= 0.5) return <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>;
    return <Badge className="bg-gray-100 text-gray-800">Starting</Badge>;
  };

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-800">Dashboard</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Welcome back! Here's your FIRE progress for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="bg-neutral-50 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-neutral-600">System Ready</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">Ready for imports</p>
            </div>
            
            <Button onClick={() => setShowImportModal(true)} className="fire-button-primary">
              <Plus className="w-4 h-4 mr-2" />
              Import New Statement
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* FIRE Progress Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FIRE Timeline Card */}
          <div className="fire-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-800">FIRE Timeline</h3>
              <div className="w-10 h-10 bg-orange-500 bg-opacity-10 rounded-lg flex items-center justify-center">
                <Flame className="text-orange-500" size={20} />
              </div>
            </div>
            
            <div className="text-center mb-6">
              <div className="text-3xl font-bold text-blue-600">
                {dashboardData?.fireMetrics.timeToFire 
                  ? dashboardData.fireMetrics.timeToFire === Infinity 
                    ? "∞" 
                    : dashboardData.fireMetrics.timeToFire.toFixed(1)
                  : "0"}
              </div>
              <div className="text-sm text-neutral-400">years to FIRE</div>
              <div className="text-xs text-neutral-400 mt-1">
                Target Date: {dashboardData?.fireMetrics.timeToFire !== Infinity 
                  ? new Date(Date.now() + (dashboardData?.fireMetrics.timeToFire || 0) * 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : "N/A"}
              </div>
            </div>
            
            {/* Progress Ring */}
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="#E1E5E9" strokeWidth="8"/>
                <circle 
                  cx="64" 
                  cy="64" 
                  r="56" 
                  fill="none" 
                  stroke="#2E7D32" 
                  strokeWidth="8" 
                  strokeDasharray="351.8" 
                  strokeDashoffset={351.8 - (351.8 * (dashboardData?.fireMetrics.fireProgress || 0))}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-xl font-bold text-green-600">
                    {formatPercentage(dashboardData?.fireMetrics.fireProgress || 0)}
                  </div>
                  <div className="text-xs text-neutral-400">Complete</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Monthly Metrics */}
          <div className="lg:col-span-2 fire-card p-6">
            <h3 className="text-lg font-semibold text-neutral-800 mb-6">Monthly Overview</h3>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <ArrowUp className="text-green-600" size={20} />
                </div>
                <div className="text-2xl font-bold text-neutral-800">
                  {formatCurrency(dashboardData?.fireMetrics.monthlyIncome || 0)}
                </div>
                <div className="text-sm text-neutral-400">Income</div>
                <div className="text-xs text-green-600 mt-1">Current month</div>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-neutral-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <ArrowDown className="text-neutral-600" size={20} />
                </div>
                <div className="text-2xl font-bold text-neutral-800">
                  {formatCurrency(dashboardData?.fireMetrics.monthlyExpenses || 0)}
                </div>
                <div className="text-sm text-neutral-400">Expenses</div>
                <div className="text-xs text-neutral-600 mt-1">Current month</div>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <PiggyBank className="text-blue-600" size={20} />
                </div>
                <div className="text-2xl font-bold text-neutral-800">
                  {formatCurrency((dashboardData?.fireMetrics.monthlyIncome || 0) - (dashboardData?.fireMetrics.monthlyExpenses || 0))}
                </div>
                <div className="text-sm text-neutral-400">Saved</div>
                <div className="text-xs text-blue-600 mt-1">
                  {formatPercentage(dashboardData?.fireMetrics.savingsRate || 0)} rate
                </div>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Shield className="text-orange-500" size={20} />
                </div>
                <div className="text-2xl font-bold text-neutral-800">
                  {formatCurrency(dashboardData?.fireMetrics.bufferStatus.current || 0)}
                </div>
                <div className="text-sm text-neutral-400">Buffer</div>
                <div className={`text-xs mt-1 ${getBufferStatusColor(dashboardData?.fireMetrics.bufferStatus.status || 'optimal')}`}>
                  {dashboardData?.fireMetrics.bufferStatus.status === 'optimal' ? 'Target met' : 
                   dashboardData?.fireMetrics.bufferStatus.status === 'above' ? 'Above target' : 'Below target'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Income Volatility Indicator */}
        <div className="fire-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-neutral-800">Income Volatility Monitor</h3>
              <p className="text-sm text-neutral-400">Rolling 6-month income analysis with buffer recommendations</p>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                dashboardData?.fireMetrics.volatility.score === 'low' ? 'bg-green-500' :
                dashboardData?.fireMetrics.volatility.score === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className={`text-sm font-medium ${
                dashboardData?.fireMetrics.volatility.score === 'low' ? 'text-green-600' :
                dashboardData?.fireMetrics.volatility.score === 'medium' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {dashboardData?.fireMetrics.volatility.score === 'low' ? 'Stable' :
                 dashboardData?.fireMetrics.volatility.score === 'medium' ? 'Moderate' : 'Volatile'}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <IncomeVolatilityChart data={dashboardData?.fireMetrics} />
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-neutral-600">6-Month Average</span>
                  <span className="text-lg font-bold text-neutral-800">
                    {formatCurrency(dashboardData?.fireMetrics.volatility.average || 0)}
                  </span>
                </div>
                <div className="text-xs text-neutral-400">
                  Standard deviation: {formatCurrency(dashboardData?.fireMetrics.volatility.standardDeviation || 0)}
                </div>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-700">Buffer Status</span>
                  <span className="text-lg font-bold text-green-700">
                    {dashboardData?.fireMetrics.bufferStatus.status === 'optimal' ? 'Optimal' :
                     dashboardData?.fireMetrics.bufferStatus.status === 'above' ? 'Above' : 'Below'}
                  </span>
                </div>
                <div className="text-xs text-green-600">
                  Current: {formatCurrency(dashboardData?.fireMetrics.bufferStatus.current || 0)} / 
                  Target: {formatCurrency(dashboardData?.fireMetrics.bufferStatus.target || 0)}
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">Volatility Score</span>
                  <span className="text-lg font-bold text-blue-700">
                    {dashboardData?.fireMetrics.volatility.score === 'low' ? 'Low' :
                     dashboardData?.fireMetrics.volatility.score === 'medium' ? 'Medium' : 'High'}
                  </span>
                </div>
                <div className="text-xs text-blue-600">
                  Coefficient of variation: {((dashboardData?.fireMetrics.volatility.coefficientOfVariation || 0) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transfers and Account Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transfer Instructions */}
          <div className="fire-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-neutral-800">Recent Transfer Instructions</h3>
              <Button variant="ghost" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                View All
                <ArrowLeftRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {dashboardData?.transferRecommendations.slice(0, 3).map((rec, index) => {
                const fromAccount = dashboardData.accounts.find(a => a.id === rec.fromAccountId);
                const toAccount = dashboardData.accounts.find(a => a.id === rec.toAccountId);
                
                return (
                  <div key={rec.id} className="flex items-center p-3 bg-neutral-50 rounded-lg">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                      {rec.status === 'completed' ? (
                        <CheckCircle className="text-white" size={16} />
                      ) : (
                        <Clock className="text-white" size={16} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800">
                        Transfer {formatCurrency(rec.amount)} from {fromAccount?.customName || 'Unknown Account'}
                      </p>
                      <p className="text-xs text-neutral-400">
                        to {toAccount?.customName || 'Unknown Account'}
                      </p>
                    </div>
                    <div className={`text-xs font-medium ${
                      rec.status === 'completed' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {rec.status === 'completed' ? '✓ Done' : 'Pending'}
                    </div>
                  </div>
                );
              })}
              
              {(!dashboardData?.transferRecommendations || dashboardData.transferRecommendations.length === 0) && (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-2">
                    <ArrowLeftRight size={32} className="mx-auto" />
                  </div>
                  <p className="text-sm text-gray-500">No transfer recommendations yet</p>
                  <p className="text-xs text-gray-400">Import statements to get recommendations</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Account Overview */}
          <div className="fire-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-neutral-800">Account Overview</h3>
              <Button variant="ghost" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Manage Accounts
                <TrendingUp className="w-4 h-4 ml-1" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {dashboardData?.accounts.slice(0, 3).map((account) => (
                <div key={account.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                      <TrendingUp className="text-blue-600" size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-800">
                        {account.customName || account.accountHolderName}
                      </p>
                      <p className="text-xs text-neutral-400">
                        ...{account.iban.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-800">
                      {formatCurrency(0)} {/* Balance would come from account balances */}
                    </p>
                    <p className="text-xs text-green-600">Recent activity</p>
                  </div>
                </div>
              ))}
              
              {(!dashboardData?.accounts || dashboardData.accounts.length === 0) && (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-2">
                    <TrendingUp size={32} className="mx-auto" />
                  </div>
                  <p className="text-sm text-gray-500">No accounts found</p>
                  <p className="text-xs text-gray-400">Import your first statement to get started</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Savings Goals */}
        <div className="fire-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-neutral-800">Savings Goals Progress</h3>
            <Button className="fire-button-primary">
              <Plus className="w-4 h-4 mr-2" />
              Add Goal
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardData?.goals.map((goal) => {
              const current = parseFloat(goal.currentAmount);
              const target = parseFloat(goal.targetAmount);
              const progress = Math.min((current / target) * 100, 100);
              
              return (
                <div key={goal.id} className="p-4 border border-neutral-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-neutral-800">{goal.name}</h4>
                    {getGoalStatusBadge(goal)}
                  </div>
                  
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-neutral-600">{formatCurrency(current)}</span>
                      <span className="text-neutral-600">{formatCurrency(target)}</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span>Target: {goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'No date'}</span>
                    <span>{progress.toFixed(0)}% complete</span>
                  </div>
                </div>
              );
            })}
            
            {(!dashboardData?.goals || dashboardData.goals.length === 0) && (
              <div className="col-span-full text-center py-8">
                <div className="text-gray-400 mb-2">
                  <Target size={32} className="mx-auto" />
                </div>
                <p className="text-sm text-gray-500">No savings goals yet</p>
                <p className="text-xs text-gray-400">Create your first goal to start tracking progress</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        userId={DEMO_USER_ID}
      />
    </>
  );
}
