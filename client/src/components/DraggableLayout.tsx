import { useState, useMemo, useCallback, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown, PiggyBank, Shield, Flame, TrendingUp, CheckCircle, Clock, ArrowLeftRight, Target } from "lucide-react";
import type { DashboardData, Account, TransferRecommendation, Goal } from "@/types";
import LazyChartWrapper from "./charts/LazyChartWrapper";
import MonthlyOverview from "./MonthlyOverview";
import AIFixedExpenseInsights from "./AIFixedExpenseInsights";
import AITransferRecommendations from "./AITransferRecommendations";

interface DashboardComponent {
  id: string;
  title: string;
  component: React.ReactNode;
  order: number;
}

interface DraggableLayoutProps {
  dashboardData?: DashboardData;
}

const DraggableLayout = memo(function DraggableLayout({ dashboardData }: DraggableLayoutProps) {
  // Memoize formatter functions to prevent recreation on each render
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const formatPercentage = useCallback((value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  }, []);

  // Memoize expensive component calculations
  const accountsComponent = useMemo(() => (
    <div className="space-y-4">
      {dashboardData?.accounts?.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <Shield size={32} className="mx-auto" />
          </div>
          <p className="text-sm text-gray-500">No accounts connected yet</p>
          <p className="text-xs text-gray-400">Import a bank statement to get started</p>
        </div>
      ) : (
        dashboardData?.accounts?.map((account: Account) => (
          <div key={account.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-neutral-800">
                {account.customName || account.accountHolderName}
              </p>
              <p className="text-xs text-neutral-400">{account.iban}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-neutral-800">Connected</p>
              <p className="text-xs text-green-600">{account.accountType}</p>
            </div>
          </div>
        ))
      )}
    </div>
  ), [dashboardData?.accounts]);

  const transfersComponent = useMemo(() => (
    <div className="space-y-3">
      {(!dashboardData?.transferRecommendations || dashboardData.transferRecommendations.length === 0) ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <ArrowLeftRight size={32} className="mx-auto" />
          </div>
          <p className="text-sm text-gray-500">No transfer recommendations yet</p>
          <p className="text-xs text-gray-400">Recommendations appear after importing transactions</p>
        </div>
      ) : (
        dashboardData.transferRecommendations.slice(0, 3).map((transfer: TransferRecommendation) => (
          <div key={transfer.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-800">
                {formatCurrency(parseFloat(transfer.amount))}
              </span>
              <span className="text-xs text-blue-600 px-2 py-1 bg-blue-100 rounded">
                {transfer.status}
              </span>
            </div>
            <p className="text-xs text-blue-700">{transfer.purpose}</p>
          </div>
        ))
      )}
    </div>
  ), [dashboardData?.transferRecommendations, formatCurrency]);

  const goalsComponent = useMemo(() => (
    <div className="grid grid-cols-1 gap-4">
      {(!dashboardData?.goals || dashboardData.goals.length === 0) ? (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <Target size={32} className="mx-auto" />
          </div>
          <p className="text-sm text-gray-500">No savings goals yet</p>
          <p className="text-xs text-gray-400">Create your first goal to start tracking progress</p>
        </div>
      ) : (
        dashboardData.goals.slice(0, 3).map((goal: Goal) => {
          const progress = parseFloat(goal.currentAmount || "0") / parseFloat(goal.targetAmount);
          const progressPercentage = Math.min(progress * 100, 100);

          return (
            <div key={goal.id} className="p-4 border border-neutral-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-neutral-800">{goal.name}</h4>
                <span className="text-xs text-neutral-500">
                  {progressPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>{formatCurrency(parseFloat(goal.currentAmount || "0"))}</span>
                <span>{formatCurrency(parseFloat(goal.targetAmount))}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  ), [dashboardData?.goals, formatCurrency]);

  const fireTimelineComponent = useMemo(() => (
    <div className="text-center">
      <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Flame className="text-orange-500" size={24} />
      </div>
      <div className="text-3xl font-bold text-neutral-800 mb-2">
        {dashboardData?.data?.fireMetrics?.timeToFire || 0} years
      </div>
      <p className="text-sm text-neutral-600 mb-4">
        Until Financial Independence
      </p>
      <div className="w-full bg-neutral-200 rounded-full h-3">
        <div 
          className="bg-gradient-to-r from-orange-400 to-red-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${Math.min((dashboardData?.data?.fireMetrics?.fireProgress || 0) * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-neutral-500 mt-2">
        {formatPercentage(dashboardData?.data?.fireMetrics?.fireProgress || 0)} complete
      </p>
    </div>
  ), [dashboardData?.data?.fireMetrics, formatPercentage]);

  const [components, setComponents] = useState<DashboardComponent[]>([
    {
      id: 'monthly-overview',
      title: 'Monthly Overview',
      order: 1,
      component: <MonthlyOverview dashboardData={dashboardData} />
    },
    {
      id: 'volatility-monitor',
      title: 'Income Volatility Monitor',
      order: 2,
      component: <LazyChartWrapper chartType="income-volatility" data={dashboardData?.data?.fireMetrics} />
    },
    {
      id: 'account-overview',
      title: 'Account Overview',
      order: 3,
      component: accountsComponent
    },
    {
      id: 'transfer-instructions',
      title: 'Recent Transfer Instructions',
      order: 4,
      component: transfersComponent
    },
    {
      id: 'savings-goals',
      title: 'Savings Goals Progress',
      order: 5,
      component: goalsComponent
    },
    {
      id: 'ai-fixed-expense',
      title: 'AI Fixed Expense Insights',
      order: 6,
      component: <AIFixedExpenseInsights />
    },
    {
      id: 'ai-transfer-recommendations',
      title: 'AI Transfer Recommendations',
      order: 7,
      component: <AITransferRecommendations />
    },
    {
      id: 'fire-timeline',
      title: 'FIRE Timeline',
      order: 8,
      component: fireTimelineComponent
    }
  ]);

  // Memoize component manipulation functions
  const moveComponent = useCallback((dragIndex: number, hoverIndex: number) => {
    const draggedComponent = components[dragIndex];
    const newComponents = [...components];
    newComponents.splice(dragIndex, 1);
    newComponents.splice(hoverIndex, 0, draggedComponent);

    const reorderedComponents = newComponents.map((comp, index) => ({
      ...comp,
      order: index + 1
    }));

    setComponents(reorderedComponents);
  }, [components]);

  const resetToDefault = useCallback(() => {
    setComponents(prev => 
      prev.sort((a, b) => parseInt(a.id.split('-')[0]) - parseInt(b.id.split('-')[0]))
         .map((comp, index) => ({ ...comp, order: index + 1 }))
    );
  }, []);

  // Memoize sorted components to prevent sorting on every render
  const sortedComponents = useMemo(() => {
    return components.sort((a, b) => a.order - b.order);
  }, [components]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
        <h2 className="text-base sm:text-lg font-semibold text-neutral-800">Dashboard Layout</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={resetToDefault}
          className="text-xs w-full sm:w-auto"
        >
          Reset Layout
        </Button>
      </div>

      {sortedComponents.map((component, index) => (
          <Card key={component.id} className="fire-card">
            <CardHeader className="pb-3">
              <div className="flex items-start sm:items-center justify-between">
                <CardTitle className="text-base sm:text-lg min-w-0 flex-1 truncate pr-2">{component.title}</CardTitle>
                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => index > 0 && moveComponent(index, index - 1)}
                    disabled={index === 0}
                    className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => index < components.length - 1 && moveComponent(index, index + 1)}
                    disabled={index === components.length - 1}
                    className="h-6 w-6 sm:h-8 sm:w-8 p-0"
                  >
                    <ArrowDown size={12} />
                  </Button>
                  <GripVertical size={14} className="text-neutral-400 hidden sm:block" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {component.component}
            </CardContent>
          </Card>
        ))}
    </div>
  );
});

export default DraggableLayout;
